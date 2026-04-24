'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expect } = require('chai');

const SECRETLINTRC = path.resolve(__dirname, '../../../../../scripts/ci/.secretlintrc.json');
const SECRETLINT = path.resolve(__dirname, '../../../../../node_modules/.bin/secretlint');

const runSecretlint = (line) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretlint-test-'));
  try {
    const logFile = path.join(tmpDir, 'test.log');
    fs.writeFileSync(logFile, line + '\n', 'utf8');
    try {
      execFileSync(SECRETLINT, ['--secretlintrc', SECRETLINTRC, logFile], { stdio: 'pipe' });
      return false;
    } catch {
      return true;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

describe('scripts/ci/.secretlintrc.json', () => {
  describe('should flag credential leaks', () => {
    it('user:pass@host (http)', () => {
      expect(runSecretlint('2024-01-01 INFO: http://admin:mysecret@couchdb:5984/medic')).to.be.true;
    });
    it('user:pass@host (https)', () => {
      expect(runSecretlint('2024-01-01 INFO: https://user:pwd123@example.com/api')).to.be.true;
    });
    it('user:pass@host (custom scheme)', () => {
      expect(runSecretlint('2024-01-01 INFO: couchdb://user:pass@localhost:5984')).to.be.true;
    });
    it('credential in query param (password)', () => {
      expect(runSecretlint('2024-01-01 INFO: GET /api?password=hunter2')).to.be.true;
    });
    it('credential in query param (pass)', () => {
      expect(runSecretlint('2024-01-01 INFO: GET /api?pass=hunter2')).to.be.true;
    });
    it('credential in query param (token)', () => {
      expect(runSecretlint('2024-01-01 INFO: POST /upload?token=abc123')).to.be.true;
    });
    it('credential in JSON (password)', () => {
      expect(runSecretlint('2024-01-01 INFO: {"password":"plaintext"}')).to.be.true;
    });
    it('credential in JSON (pass)', () => {
      expect(runSecretlint('2024-01-01 INFO: {"pass":"plaintext"}')).to.be.true;
    });
    it('credential in JSON (secret)', () => {
      expect(runSecretlint('2024-01-01 INFO: {"secret":"mysecretval"}')).to.be.true;
    });
    it('Authorization header (Basic)', () => {
      expect(runSecretlint('2024-01-01 INFO: Authorization: Basic dXNlcjpwYXNz')).to.be.true;
    });
    it('Authorization header (Token)', () => {
      expect(runSecretlint('2024-01-01 INFO: Authorization: Token abc123def')).to.be.true;
    });
  });

  describe('should not flag safe patterns', () => {
    it('Authorization Bearer *** (masked)', () => {
      expect(runSecretlint('2024-01-01 INFO: Authorization: Bearer ***')).to.be.false;
    });
    it('JSON password already redacted', () => {
      expect(runSecretlint('2024-01-01 INFO: {"password":"[REDACTED]"}')).to.be.false;
    });
    it('JSON password masked with stars', () => {
      expect(runSecretlint('2024-01-01 INFO: {"password":"***"}')).to.be.false;
    });
    it('URL without credentials', () => {
      expect(runSecretlint('2024-01-01 INFO: GET http://localhost:5984/medic')).to.be.false;
    });
    it('URL with user but no pass', () => {
      expect(runSecretlint('2024-01-01 INFO: connecting http://admin@host')).to.be.false;
    });
    it('ERROR line (not a credential)', () => {
      expect(runSecretlint('2024-01-01 ERROR: connect ECONNREFUSED')).to.be.false;
    });
    it('plain log line', () => {
      expect(runSecretlint('2024-01-01 INFO: Server started')).to.be.false;
    });
  });
});
