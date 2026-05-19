// 霸凌保护姓名模块
// 当用户发帖/评论/讨论时，如果内容中包含此名单中的姓名，则阻止发送并弹出警告
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');
const NAMES_FILE = path.join(DATA_DIR, 'bullying_names.json');

// ===== 加载姓名列表 =====
function loadNames() {
  try {
    if (!fs.existsSync(NAMES_FILE)) return [];
    const raw = fs.readFileSync(NAMES_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.names)) return [];
    return data.names.filter(n => typeof n === 'string' && n.trim().length >= 1);
  } catch (e) {
    console.error('[bullyingNames] 加载失败:', e.message);
    return [];
  }
}

// ===== 保存姓名列表 =====
function saveNames(names) {
  try {
    ensureDir();
    fs.writeFileSync(NAMES_FILE, JSON.stringify({ names: names }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[bullyingNames] 保存失败:', e.message);
  }
}

// ===== 初始化 =====
let PROTECTED_NAMES = loadNames();

// ===== 重新加载 =====
function reload() {
  PROTECTED_NAMES = loadNames();
  console.log(`[bullyingNames] 已重新加载，共 ${PROTECTED_NAMES.length} 个保护姓名`);
}

// ===== 检测函数 =====
function check(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  for (const name of PROTECTED_NAMES) {
    if (text.includes(name)) found.push(name);
    if (found.length >= 20) break;
  }
  return found;
}

// ===== 添加姓名（自动或手动）=====
function addName(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (PROTECTED_NAMES.includes(trimmed)) return false; // 已存在
  PROTECTED_NAMES.push(trimmed);
  saveNames(PROTECTED_NAMES);
  return true;
}

// ===== 删除姓名 =====
function removeName(name) {
  const trimmed = name.trim();
  const idx = PROTECTED_NAMES.indexOf(trimmed);
  if (idx === -1) return false;
  PROTECTED_NAMES.splice(idx, 1);
  saveNames(PROTECTED_NAMES);
  return true;
}

// ===== 获取全部 =====
function getAll() {
  return PROTECTED_NAMES.slice();
}

// ===== 确保目录存在 =====
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

module.exports = { check, addName, removeName, getAll, reload, NAMES_FILE };
