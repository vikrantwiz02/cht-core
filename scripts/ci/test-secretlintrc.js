#!/usr/bin/env node
/**
 * Tests for scripts/ci/.secretlintrc.json
 *
 * Verifies that the secretlint credential-detection config:
 *  - flags lines containing real credentials (user:pass@host, query-param
 *    secrets, JSON credential fields, Authorization headers)
 *  - does NOT flag already-redacted values or safe log lines
 *
 * Usage: node scripts/ci/test-secretlintrc.js
 * Exit 0: all tests pass
 * Exit 1: one or more tests failed
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs            = require('node:fs');
const os            = require('node:os');
const path          = require('node:path');

const SECRETLINTRC = path.join(__dirname, '.secretlintrc.json');
const SECRETLINT   = path.join(__dirname, '../../node_modules/.bin/secretlint');

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

/**
 * Each entry:
 *   desc        – test description
 *   line        – single log line written to a temp file
 *   expectFlag  – true if secretlint should exit 1 (violation found)
 */
const TESTS = [
  // ── Should flag ───────────────────────────────────────────────────────────
  {
    desc: 'user:pass@host (http)',
    line: '2024-01-01 INFO: http://admin:mysecret@couchdb:5984/medic',
    expectFlag: true,
  },
  {
    desc: 'user:pass@host (https)',
    line: '2024-01-01 INFO: https://user:pwd123@example.com/api',
    expectFlag: true,
  },
  {
    desc: 'user:pass@host (custom scheme)',
    line: '2024-01-01 INFO: couchdb://user:pass@localhost:5984',
    expectFlag: true,
  },
  {
    desc: 'credential in query param (password)',
    line: '2024-01-01 INFO: GET /api?password=hunter2',
    expectFlag: true,
  },
  {
    desc: 'credential in query param (token)',
    line: '2024-01-01 INFO: POST /upload?token=abc123',
    expectFlag: true,
  },
  {
    desc: 'credential in JSON (password)',
    line: '2024-01-01 INFO: {"password":"plaintext"}',
    expectFlag: true,
  },
  {
    desc: 'credential in JSON (secret)',
    line: '2024-01-01 INFO: {"secret":"mysecretval"}',
    expectFlag: true,
  },
  {
    desc: 'Authorization header (Basic)',
    line: '2024-01-01 INFO: Authorization: Basic dXNlcjpwYXNz',
    expectFlag: true,
  },
  {
    desc: 'Authorization header (Token)',
    line: '2024-01-01 INFO: Authorization: Token abc123def',
    expectFlag: true,
  },

  // ── Should NOT flag ───────────────────────────────────────────────────────
  {
    desc: 'Authorization Bearer *** (masked)',
    line: '2024-01-01 INFO: Authorization: Bearer ***',
    expectFlag: false,
  },
  {
    desc: 'JSON password already redacted',
    line: '2024-01-01 INFO: {"password":"[REDACTED]"}',
    expectFlag: false,
  },
  {
    desc: 'JSON password masked with stars',
    line: '2024-01-01 INFO: {"password":"***"}',
    expectFlag: false,
  },
  {
    desc: 'URL without credentials',
    line: '2024-01-01 INFO: GET http://localhost:5984/medic',
    expectFlag: false,
  },
  {
    desc: 'URL with user but no pass',
    line: '2024-01-01 INFO: connecting http://admin@host',
    expectFlag: false,
  },
  {
    desc: 'ERROR line (not a credential)',
    line: '2024-01-01 ERROR: connect ECONNREFUSED',
    expectFlag: false,
  },
  {
    desc: 'plain log line',
    line: '2024-01-01 INFO: Server started',
    expectFlag: false,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretlint-test-'));

try {
  for (const { desc, line, expectFlag } of TESTS) {
    const logFile = path.join(tmpDir, 'test.log');
    fs.writeFileSync(logFile, line + '\n', 'utf8');

    let flagged;
    try {
      execFileSync(SECRETLINT, ['--secretlintrc', SECRETLINTRC, logFile], { stdio: 'pipe' });
      flagged = false;
    } catch {
      flagged = true;
    }

    if (flagged === expectFlag) {
      console.log(`  PASS  ${desc}`);
      pass++;
    } else {
      console.error(`  FAIL  ${desc}`);
      console.error(`        expected flagged=${expectFlag}, got flagged=${flagged}`);
      console.error(`        line: ${line}`);
      fail++;
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
