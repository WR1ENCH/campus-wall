const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { generateId, generateUID, isValidIdFormat, logIdAssignment } = require('../lib/uniqueId');

const VALID_PREFIXES = ['POST', 'POCM', 'DISC', 'DICM', 'QAQU', 'QAAN', 'VOTE', 'AURQ'];

describe('uniqueId', () => {
  describe('generateId', () => {
    it('returns correct format for each prefix', () => {
      for (const prefix of VALID_PREFIXES) {
        const id = generateId(prefix);
        assert.match(id, new RegExp(`^${prefix}-[A-Z0-9]{16}$`), `prefix ${prefix} format mismatch`);
      }
    });

    it('rejects invalid prefix', () => {
      assert.throws(() => generateId('INVALID'), /invalid prefix/i);
      assert.throws(() => generateId(''), /invalid prefix/i);
      assert.throws(() => generateId(null), /invalid prefix/i);
      assert.throws(() => generateId('post'), /invalid prefix/i);
    });

    it('returns unique IDs across 100 calls', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('POST'));
      }
      assert.equal(ids.size, 100, 'expected 100 unique IDs');
    });
  });

  describe('generateUID', () => {
    it('returns 16 digits', () => {
      const uid = generateUID();
      assert.match(uid, /^[0-9]{16}$/);
    });

    it('returns unique values across 100 calls', () => {
      const uids = new Set();
      for (let i = 0; i < 100; i++) {
        uids.add(generateUID());
      }
      assert.equal(uids.size, 100, 'expected 100 unique UIDs');
    });
  });

  describe('isValidIdFormat', () => {
    it('validates prefixed IDs correctly', () => {
      const validId = generateId('POST');
      assert.equal(isValidIdFormat(validId), true);
    });

    it('rejects invalid prefixed IDs', () => {
      assert.equal(isValidIdFormat('INVALID-123456789012345'), false);
      assert.equal(isValidIdFormat('POST-'), false);
      assert.equal(isValidIdFormat('POST-123'), false);
      assert.equal(isValidIdFormat('POST-12345678901234567'), false); // too long
      assert.equal(isValidIdFormat('post-ABCDEFGH12345678'), false); // lowercase
    });

    it('validates 16-digit UIDs correctly', () => {
      const validUid = generateUID();
      assert.equal(isValidIdFormat(validUid), true);
    });

    it('rejects invalid UIDs', () => {
      assert.equal(isValidIdFormat('123456789012345'), false); // 15 digits
      assert.equal(isValidIdFormat('12345678901234567'), false); // 17 digits
      assert.equal(isValidIdFormat('123456789012345a'), false); // contains letter
    });

    it('handles edge cases', () => {
      assert.equal(isValidIdFormat(''), false);
      assert.equal(isValidIdFormat(null), false);
      assert.equal(isValidIdFormat(undefined), false);
    });

    it('rejects old-format IDs', () => {
      // Old format: Date.now().toString(36) + random alphanumeric
      const oldFormat = Date.now().toString(36) + 'abc123DEF456';
      assert.equal(isValidIdFormat(oldFormat), false);
    });
  });

  describe('logIdAssignment', () => {
    const dataDir = path.join(__dirname, '..', 'data');
    const logFile = path.join(dataDir, 'ID_input.log');
    let originalExists;

    before(() => {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    });

    after(() => {
      // clean up log file if created
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }
    });

    it('writes to file and calls db.addIdInput', () => {
      let called = false;
      let callArgs = null;
      const mockDb = {
        addIdInput: function (entityType, entityId, content) {
          called = true;
          callArgs = { entityType, entityId, content };
        }
      };

      // Should not throw
      logIdAssignment('POST', 'POST-ABCDEFGH12345678', 'test content', mockDb);

      assert.equal(called, true, 'db.addIdInput should have been called');
      assert.equal(callArgs.entityType, 'POST');
      assert.equal(callArgs.entityId, 'POST-ABCDEFGH12345678');
      assert.equal(callArgs.content, 'test content');

      // Verify file was appended
      assert.ok(fs.existsSync(logFile), 'log file should exist');
      const content = fs.readFileSync(logFile, 'utf-8');
      assert.ok(content.includes('POST-ABCDEFGH12345678'), 'log file should contain the ID');
    });
  });
});
