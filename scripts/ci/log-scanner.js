#!/usr/bin/env node
/**
 * Post-test security log scanner for CHT-Core CI (issue #6571).
 *
 * Scans all *.log files in the given directory for:
 *   - Credentials leaked into log lines (user:pass@host URLs, query-param secrets,
 *     JSON key/value pairs, Authorization headers)
 *   - Unexpected 500-level HTTP responses and server-side stack traces
 *
 * Known-safe patterns are suppressed via scripts/ci/log-scanner-allowlist.json.
 *
 * Usage:  node scripts/ci/log-scanner.js <log-dir>
 * Exit 0: no violations found
 * Exit 1: one or more violations found — build should be failed
 * Exit 2: internal script error
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWLIST_PATH = path.join(__dirname, 'log-scanner-allowlist.json');

/** Lines longer than this are skipped to prevent ReDoS on minified content. */
const MAX_LINE_LENGTH = 10000;

/**
 * Minimum character length an allow-list pattern string must have.
 * Prevents patterns like `.*` from silencing the entire scanner.
 */
const ALLOWLIST_MIN_PATTERN_LENGTH = 10;

/** Generic wildcard shapes that are disallowed on their own without a literal anchor. */
const ALLOWLIST_GENERIC_WILDCARD = /^\.\*$|^\.\+$|^\\S\+$/;

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

/**
 * Each entry: { label, pattern, redact }
 *   label   – human-readable category name used in violation output
 *   pattern – RegExp to test against each log line
 *   redact  – optional function(line, match) → redacted string for safe display
 */
const CREDENTIAL_CHECKS = [
  {
    label: 'user:pass@host URL',
    // Matches any scheme://user:pass@host pattern (http, https, couchdb, …)
    pattern: /[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/[^:\s/]+:[^@\s/]+@/,
    redact: (line, match) => line.replace(match[0], match[0].replace(/:[^@]+@/, ':[REDACTED]@')),
  },
  {
    label: 'credential in query parameter',
    // Matches ?password=value or &token=value etc. in URLs or log fragments
    pattern: /(?:password|passwd|token|secret|api[_-]key)=[^&\s"']+/gi,
    redact: (line, match) => line.replace(match[0], match[0].replace(/=.+/, '=[REDACTED]')),
  },
  {
    label: 'credential in JSON key/value',
    // Matches "password":"value" in serialised objects written to logs.
    // Negative lookahead skips already-redacted values (*** or [REDACTED]).
    pattern: /"(?:password|passwd|token|secret|api[_-]key)"\s*:\s*"(?!\*{3}|\[REDACTED\])[^"]+"/i,
    redact: (line, match) => line.replace(match[0], match[0].replace(/:\s*"[^"]+"/, ': "[REDACTED]"')),
  },
  {
    label: 'Authorization header in log',
    // Matches Authorization: <value> that wasn't already masked.
    // The negative lookahead avoids flagging "Authorization: Bearer ***".
    pattern: /\bAuthorization\s*:\s*(?!Bearer \*)\S+/i,
    redact: (line, match) => line.replace(match[0], 'Authorization: [REDACTED]'),
  },
];

const ERROR_CHECKS = [
  {
    label: '500-level HTTP response',
    // CHT log format for outgoing HTTP responses: "RES: … 5xx …"
    pattern: /\bRES:.*\s5\d\d\b/,
    redact: (line) => line,
  },
  {
    label: 'unexpected stack trace',
    // A line starting with "    at " (Node.js stack frame) following an ERROR line
    // is picked up by the multi-line stack-trace collector in scanFile(), not here.
    // This pattern catches single-line ERROR entries that contain stack text inline.
    pattern: /\bERROR:.*\s+at\s+\w/,
    redact: (line) => line,
  },
];

// ---------------------------------------------------------------------------
// Allow-list validation
// ---------------------------------------------------------------------------

/**
 * Reads and validates the allow-list JSON file.
 * Exits with code 2 if any entry is too broad, forcing the developer to be specific.
 * @returns {RegExp[]} compiled allow-list patterns
 */
const loadAllowlist = function () {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.warn(`[log-scanner] Allow-list not found at ${ALLOWLIST_PATH} — all matches will be reported`);
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const entries = raw.entries || [];
  const compiled = [];

  for (const entry of entries) {
    const { pattern, reason } = entry;

    if (!pattern) {
      console.error(`[log-scanner] ERROR: allow-list entry missing 'pattern' field (reason: ${reason}). Exiting.`);
      process.exit(2);
    }

    if (pattern.length < ALLOWLIST_MIN_PATTERN_LENGTH) {
      console.error(
        `[log-scanner] ERROR: allow-list pattern '${pattern}' is too short` +
        ` (< ${ALLOWLIST_MIN_PATTERN_LENGTH} chars). Tighten the pattern or add a literal anchor. Exiting.`
      );
      process.exit(2);
    }

    if (ALLOWLIST_GENERIC_WILDCARD.test(pattern.trim())) {
      console.error(
        `[log-scanner] ERROR: allow-list pattern '${pattern}' is a bare wildcard` +
        ` and would suppress all matches. Provide a more specific pattern. Exiting.`
      );
      process.exit(2);
    }

    compiled.push(new RegExp(pattern, 'i'));
  }

  return compiled;
};

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/** Detect whether we are running inside a GitHub Actions runner. */
const IS_GITHUB_ACTIONS = !!process.env.GITHUB_ACTIONS;

/**
 * Emit a violation. In GitHub Actions this uses the workflow command syntax
 * so the violation appears as an annotation on the PR's Files Changed tab.
 */
const emitViolation = function (filePath, lineNumber, label, redactedLine) {
  if (IS_GITHUB_ACTIONS) {
    // GitHub Actions annotation: ::error file=<f>,line=<n>::<message>
    console.log(`::error file=${filePath},line=${lineNumber}::${label} — ${redactedLine.trim()}`);
  } else {
    console.log(`[VIOLATION] ${filePath}:${lineNumber}  [${label}]  ${redactedLine.trim()}`);
  }
};

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

/**
 * Scan a single log file for credential and error violations.
 * @param {string} filePath      absolute path to the .log file
 * @param {RegExp[]} allowlist   compiled allow-list patterns
 * @returns {Promise<number>}    number of violations found in this file
 */
const scanFile = async function (filePath, allowlist) {
  let violations = 0;
  let lineNumber  = 0;
  let inErrorBlock = false; // true after an ERROR: line, until a non-stack-frame line

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber++;

    // ── Large-line defence ──────────────────────────────────────────────────
    if (line.length > MAX_LINE_LENGTH) {
      console.warn(
        `[log-scanner] WARN: ${filePath}:${lineNumber}` +
        ` — line too large to scan (${line.length} chars), skipping`
      );
      inErrorBlock = false;
      continue;
    }

    // ── Allow-list check ────────────────────────────────────────────────────
    const isAllowed = allowlist.some(re => re.test(line));

    // ── Credential checks ───────────────────────────────────────────────────
    for (const check of CREDENTIAL_CHECKS) {
      // Reset lastIndex for global regexes between lines
      check.pattern.lastIndex = 0;
      const match = check.pattern.exec(line);
      if (match && !isAllowed) {
        const redacted = check.redact ? check.redact(line, match) : line;
        emitViolation(filePath, lineNumber, check.label, redacted);
        violations++;
      }
    }

    // ── Stack-trace block tracking ──────────────────────────────────────────
    // A Node.js stack trace consists of an ERROR line followed by one or more
    // lines beginning with whitespace then "at ". Stack frames are suppressed
    // once the ERROR line itself has been reported as a violation.
    const isStackFrame = /^\s+at\s+\w/.test(line);

    if (isStackFrame && inErrorBlock) {
      // Suppress: the parent ERROR line was already reported as the violation
    } else if (isStackFrame && !inErrorBlock) {
      // Orphan stack frame with no preceding ERROR: line; report it directly
      if (!isAllowed) {
        emitViolation(filePath, lineNumber, 'unexpected stack trace', line);
        violations++;
      }
    } else {
      inErrorBlock = false;
    }

    // ── Error checks ────────────────────────────────────────────────────────
    for (const check of ERROR_CHECKS) {
      check.pattern.lastIndex = 0;
      const match = check.pattern.exec(line);
      if (match && !isAllowed) {
        emitViolation(filePath, lineNumber, check.label, check.redact ? check.redact(line, match) : line);
        violations++;
      }
    }

    // Report any ERROR: line not already flagged and not allow-listed.
    // This catches multi-line errors where the stack appears on subsequent lines.
    const isErrorLine = /\bERROR:/.test(line);
    const alreadyFlagged = ERROR_CHECKS.some(c => {
      c.pattern.lastIndex = 0;
      return c.pattern.test(line);
    });
    if (isErrorLine && !isAllowed && !alreadyFlagged) {
      emitViolation(filePath, lineNumber, 'unexpected server error', line);
      violations++;
      inErrorBlock = true; // suppress subsequent stack-frame lines
    } else if (isErrorLine && !isAllowed) {
      inErrorBlock = true; // already flagged above; still suppress stack frames
    }
  }

  return violations;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const main = async function () {
  const logDir = process.argv[2];

  if (!logDir) {
    console.error('[log-scanner] Usage: node log-scanner.js <log-dir>');
    process.exit(2);
  }

  if (!fs.existsSync(logDir)) {
    // Soft skip: the log directory may not exist if the test step was skipped.
    console.warn(`[log-scanner] Log directory not found: ${logDir} — skipping scan`);
    process.exit(0);
  }

  const allowlist = loadAllowlist();

  const logFiles = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => path.join(logDir, f));

  if (logFiles.length === 0) {
    console.warn(`[log-scanner] No *.log files found in ${logDir} — nothing to scan`);
    process.exit(0);
  }

  console.log(`[log-scanner] Scanning ${logFiles.length} log file(s) in ${logDir} …`);

  let totalViolations = 0;
  for (const filePath of logFiles) {
    const count = await scanFile(filePath, allowlist);
    totalViolations += count;
  }

  if (totalViolations > 0) {
    console.error(
      `\n[log-scanner] Found ${totalViolations} violation(s).\n` +
      `Add intentional patterns to scripts/ci/log-scanner-allowlist.json if these are expected.\n` +
      `Failing build.`
    );
    process.exit(1);
  }

  console.log('[log-scanner] No violations found. ✓');
};

main().catch(err => {
  console.error('[log-scanner] Unexpected error:', err);
  process.exit(2);
});
