#!/usr/bin/env node
/**
 * Post-test security log scanner for CHT-Core CI (issue #6571).
 *
 * Scans all *.log files in the given directory for:
 *   - Credentials leaked into log lines (user:pass@host URLs, query-param secrets,
 *     JSON key/value pairs, Authorization headers)
 *   - Unexpected 500-level HTTP responses and server-side stack traces
 *     (only when --scan-errors flag is passed)
 *
 * Known-safe patterns are suppressed via scripts/ci/log-scanner-allowlist.json.
 *
 * Usage:
 *   node scripts/ci/log-scanner.js <log-dir>              # credentials only
 *   node scripts/ci/log-scanner.js <log-dir> --scan-errors # credentials + errors
 *
 * Exit 0: no violations found
 * Exit 1: one or more violations found — build should be failed
 * Exit 2: internal script error
 */

'use strict';

const fs       = require('node:fs');
const path     = require('node:path');
const readline = require('node:readline');

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

/**
 * Bare Node.js error class headers that appear without a Winston timestamp prefix,
 * e.g. "Error: msg" or "TypeError: msg" printed directly to stderr.
 * These continue an existing error block without being reported as new violations.
 */
const BARE_ERROR_HEADER = /^(?!\d{4}-)\w*Error:\s/;

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

const detectUserPassUrl = function (line) {
  const schemeEnd = line.indexOf('://');
  if (schemeEnd === -1) {
    return null;
  }
  const userStart = schemeEnd + 3;
  const atIdx = line.indexOf('@', userStart);
  if (atIdx === -1) {
    return null;
  }
  const userInfo = line.slice(userStart, atIdx); // "user:pass" segment
  const colonIdx = userInfo.indexOf(':');
  if (colonIdx < 1 || colonIdx >= userInfo.length - 1) {
    return null; // no user, no pass, or empty pass
  }
  if (/[\s/]/.test(userInfo)) {
    return null; // spaces or path separators mean this is not a credential URL
  }
  return [line.slice(schemeEnd, atIdx + 1)]; // ["scheme://user:pass@"]
};

/**
 * Each entry: { label, exec, redact }
 *   label  – human-readable category name used in violation output
 *   exec   – function(line) → match array (match[0] = full match) or null
 *   redact – optional function(line, match) → redacted string for safe display
 */
const CREDENTIAL_CHECKS = [
  {
    label: 'user:pass@host URL',
    exec: detectUserPassUrl,
    redact: (line, match) => {
      const url = match[0]; // e.g. 'http://user:pass@'
      const atPos = url.lastIndexOf('@');
      const colonPos = url.lastIndexOf(':', atPos);
      return line.replace(url, url.slice(0, colonPos + 1) + '[REDACTED]' + url.slice(atPos));
    },
  },
  {
    label: 'credential in query parameter',
    // Matches ?password=value or &token=value etc. in URLs or log fragments
    exec: (line) => /(?:password|passwd|token|secret|api[_-]key)=[^&\s"']+/i.exec(line),
    redact: (line, match) => line.replace(match[0], match[0].replace(/=.+/, '=[REDACTED]')),
  },
  {
    label: 'credential in JSON key/value',
    // Matches "password":"value" in serialised objects written to logs.
    // Negative lookahead skips already-redacted values (*** or [REDACTED]).
    exec: (line) => /"(?:password|passwd|token|secret|api[_-]key)"\s*:\s*"(?!\*{3}|\[REDACTED\])[^"]+"/i.exec(line),
    redact: (line, match) => line.replace(match[0], match[0].replace(/:\s*"[^"]+"/, ': "[REDACTED]"')),
  },
  {
    label: 'Authorization header in log',
    // Matches Authorization: <value> that wasn't already masked.
    // The negative lookahead avoids flagging "Authorization: Bearer ***".
    exec: (line) => /\bAuthorization\s*:\s*(?!Bearer \*)\S+/i.exec(line),
    redact: (line, match) => line.replace(match[0], 'Authorization: [REDACTED]'),
  },
];

const ERROR_CHECKS = [
  {
    label: '500-level HTTP response',
    // CHT morgan format: "RES: … HTTP/<version> <status> …"
    // Anchored to the HTTP version token so content-length bytes (e.g. 504 B)
    // do not produce false positives on 2xx responses.
    pattern: /\bRES:.*HTTP\/\S+\s+5\d\d\b/,
    redact: (line) => line,
  },
  // Note: all non-allow-listed ERROR: lines are reported as 'unexpected server error'
  // by checkErrors(). Multi-line stack traces are handled via inErrorBlock tracking.
];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/** Returns the redacted form of a matched line, or the raw line if no redactor is defined. */
const getRedacted = function (check, line, match) {
  return check.redact ? check.redact(line, match) : line;
};

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
// Allow-list validation
// ---------------------------------------------------------------------------

/**
 * Validates a single allow-list entry. Exits with code 2 if the pattern is
 * too short or is a bare wildcard that would suppress all matches.
 */
const validateAllowlistEntry = function (entry) {
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
};

/**
 * Reads and validates the allow-list JSON file.
 * @returns {RegExp[]} compiled allow-list patterns
 */
const loadAllowlist = function () {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.warn(`[log-scanner] Allow-list not found at ${ALLOWLIST_PATH} — all matches will be reported`);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const entries = raw.entries || [];
  entries.forEach(validateAllowlistEntry);
  return entries.map(e => new RegExp(e.pattern, 'i'));
};

// ---------------------------------------------------------------------------
// Per-line check helpers
// ---------------------------------------------------------------------------

/**
 * Applies a single credential check to a log line.
 * @returns {number} 1 if a violation was found and reported, 0 otherwise
 */
const runCredentialCheck = function (check, line, filePath, lineNumber) {
  const match = check.exec(line);
  if (!match) {
    return 0;
  }
  emitViolation(filePath, lineNumber, check.label, getRedacted(check, line, match));
  return 1;
};

/**
 * Checks a single log line against all credential patterns.
 * Credential scanning always runs regardless of the --scan-errors flag.
 * @returns {number} number of violations found
 */
const checkCredentials = function (line, isAllowed, filePath, lineNumber) {
  if (isAllowed) {
    return 0;
  }
  let count = 0;
  for (const check of CREDENTIAL_CHECKS) {
    count += runCredentialCheck(check, line, filePath, lineNumber);
  }
  return count;
};

/**
 * Handles stack-frame tracking (only active when --scan-errors is passed).
 * - Detects bare Node.js error headers (e.g. "TypeError: msg") that appear without
 *   a Winston timestamp and treats them as error block continuations.
 * - Suppresses stack frames that follow a known ERROR line (inErrorBlock=true).
 * - Reports orphan stack frames that appear with no preceding ERROR line.
 * - Resets inErrorBlock when a normal (non-stack, non-error-header) line is seen.
 * @param {{ filePath: string, lineNumber: number }} loc  source location for output
 * @returns {{ violations: number, inErrorBlock: boolean }}
 */
const checkStackFrame = function (line, isAllowed, inErrorBlock, loc) {
  const isBareHeader = BARE_ERROR_HEADER.test(line);
  const isStack = /^\s+at\s+\w/.test(line);
  if (!isStack && !isBareHeader) {
    return { violations: 0, inErrorBlock: false };
  }
  if (isBareHeader || inErrorBlock) {
    return { violations: 0, inErrorBlock: true };
  }
  if (!isAllowed) {
    emitViolation(loc.filePath, loc.lineNumber, 'unexpected stack trace', line);
    return { violations: 1, inErrorBlock: false };
  }
  return { violations: 0, inErrorBlock: false };
};

/**
 * Checks a single log line against ERROR_CHECKS patterns and flags all
 * non-allow-listed ERROR: lines as 'unexpected server error'.
 * Also signals whether inErrorBlock should be set for the next line.
 * @returns {{ violations: number, setErrorBlock: boolean }}
 */
const checkErrors = function (line, isAllowed, filePath, lineNumber) {
  const isError = /\bERROR:/.test(line);
  if (isAllowed) {
    return { violations: 0, setErrorBlock: isError };
  }
  let violations = 0;
  for (const check of ERROR_CHECKS) {
    check.pattern.lastIndex = 0;
    const match = check.pattern.exec(line);
    if (match) {
      emitViolation(filePath, lineNumber, check.label, getRedacted(check, line, match));
      violations++;
    }
  }
  if (isError) {
    emitViolation(filePath, lineNumber, 'unexpected server error', line);
    violations++;
  }
  return { violations, setErrorBlock: isError };
};

/**
 * Combines stack-frame and error checks for a single line.
 * Returns immediately when --scan-errors is not active (credentials-only mode).
 * @param {{ inErrorBlock: boolean, scanErrors: boolean }} state  per-scan mutable state
 * @param {{ filePath: string, lineNumber: number }} loc
 * @returns {{ violations: number, inErrorBlock: boolean }}
 */
const checkErrorsAndStack = function (line, isAllowed, state, loc) {
  if (!state.scanErrors) {
    return { violations: 0, inErrorBlock: false };
  }
  const stackResult = checkStackFrame(line, isAllowed, state.inErrorBlock, loc);
  const errorResult = checkErrors(line, isAllowed, loc.filePath, loc.lineNumber);
  return {
    violations: stackResult.violations + errorResult.violations,
    inErrorBlock: stackResult.inErrorBlock || errorResult.setErrorBlock,
  };
};

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

/**
 * Scan a single log file for credential and (optionally) error violations.
 * @param {string}   filePath    absolute path to the .log file
 * @param {RegExp[]} allowlist   compiled allow-list patterns
 * @param {boolean}  scanErrors  true when --scan-errors flag was passed
 * @returns {Promise<number>}    number of violations found in this file
 */
const scanFile = async function (filePath, allowlist, scanErrors) {
  let violations = 0;
  let lineNumber  = 0;
  let inErrorBlock = false;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber++;
    if (line.length > MAX_LINE_LENGTH) {
      console.warn(`[log-scanner] WARN: ${filePath}:${lineNumber}` +
        ` — line too large to scan (${line.length} chars), skipping`);
      inErrorBlock = false;
      continue;
    }
    const isAllowed = allowlist.some(re => re.test(line));
    violations += checkCredentials(line, isAllowed, filePath, lineNumber);
    const errResult = checkErrorsAndStack(line, isAllowed, { inErrorBlock, scanErrors }, { filePath, lineNumber });
    violations += errResult.violations;
    inErrorBlock = errResult.inErrorBlock;
  }

  return violations;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Runs scanFile over every log file and returns the total violation count.
 * Extracted to keep main() within the cognitive-complexity budget.
 * @param {string[]}  logFiles   absolute paths to .log files
 * @param {RegExp[]}  allowlist  compiled allow-list patterns
 * @param {boolean}   scanErrors true when --scan-errors flag was passed
 * @returns {Promise<number>}
 */
const runScans = async function (logFiles, allowlist, scanErrors) {
  let total = 0;
  for (const filePath of logFiles) {
    total += await scanFile(filePath, allowlist, scanErrors);
  }
  return total;
};

const main = async function () {
  const logDir = process.argv[2];
  if (!logDir) {
    console.error('[log-scanner] Usage: node log-scanner.js <log-dir> [--scan-errors]');
    process.exit(2);
  }
  if (!fs.existsSync(logDir)) {
    console.warn(`[log-scanner] Log directory not found: ${logDir} — skipping scan`);
    process.exit(0);
  }
  const scanErrors = process.argv.includes('--scan-errors');
  const mode = scanErrors ? 'credentials + errors' : 'credentials only';
  const allowlist = loadAllowlist();
  const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log')).map(f => path.join(logDir, f));
  if (logFiles.length === 0) {
    console.warn(`[log-scanner] No *.log files found in ${logDir} — nothing to scan`);
    process.exit(0);
  }
  console.log(`[log-scanner] Scanning ${logFiles.length} log file(s) in ${logDir} [${mode}] …`);
  const totalViolations = await runScans(logFiles, allowlist, scanErrors);
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
