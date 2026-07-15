// ===== uniqueId.js - 数据唯一化：ID 生成与校验 =====
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VALID_PREFIXES = ['POST', 'POCM', 'DISC', 'DICM', 'QAQU', 'QAAN', 'VOTE', 'AURQ', 'REPO', 'PUNI', 'APP', 'WHIS', 'CRDL'];
const PREFIX_RE = new RegExp(`^(${VALID_PREFIXES.join('|')})-[A-Z0-9]{16}$`);
const UID_RE = /^[0-9]{16}$/;

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateId(prefix) {
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(`Invalid prefix "${prefix}". Must be one of: ${VALID_PREFIXES.join(', ')}`);
  }
  const bytes = crypto.randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ALPHANUM[bytes[i] % ALPHANUM.length];
  }
  return `${prefix}-${rand}`;
}

function generateUID() {
  const bytes = crypto.randomBytes(16);
  let uid = '';
  for (let i = 0; i < 16; i++) {
    uid += bytes[i] % 10;
  }
  return uid;
}

function isValidIdFormat(id) {
  if (typeof id !== 'string') return false;
  return PREFIX_RE.test(id) || UID_RE.test(id);
}

function logIdAssignment(entityType, entityId, content, db) {
  try {
    const logDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logLine = `[${new Date().toISOString()}] [${entityType}] [${entityId}] ${content}\n`;
    fs.appendFileSync(path.join(logDir, 'ID_input.log'), logLine);
  } catch (_) {
    // non-fatal
  }
  try {
    if (db && typeof db.addIdInput === 'function') {
      db.addIdInput(entityType, entityId, content);
    }
  } catch (_) {
    // non-fatal
  }
}

module.exports = { generateId, generateUID, isValidIdFormat, logIdAssignment, VALID_PREFIXES };
