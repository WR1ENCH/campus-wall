const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'nickname_changes.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    console.error('[nicknameChanges] load failed:', e.message);
    return {};
  }
}

function save(data) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getMonthlyCount(userId) {
  const data = load();
  const month = currentMonth();
  const key = userId + ':' + month;
  return data[key] || 0;
}

function recordChange(userId) {
  const data = load();
  const month = currentMonth();
  const key = userId + ':' + month;
  data[key] = (data[key] || 0) + 1;
  save(data);
  return data[key];
}

module.exports = { getMonthlyCount, recordChange, currentMonth };
