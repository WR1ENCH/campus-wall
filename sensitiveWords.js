// 敏感词过滤模块
// 词库从加密文件 tencent_sensitive_words.enc 中加载，
// 运行时通过环境变量 SENSITIVE_KEY 解密
const fs = require('fs');
const path = require('path');
const { decryptFile } = require('./crypto_words');

// ===== 内置核心敏感词 =====
const CORE_WORDS = [
  '赌博','赌场','博彩','赌球','时时彩','百家乐','网赌',
  '毒品','大麻','海洛因','冰毒','K粉','摇头丸','吸毒','贩毒',
  '枪支','手枪','炸弹','炸药','恐怖袭击','恐怖分子',
  '诈骗','电信诈骗','网络诈骗','金融诈骗','假药','假币',
  '卖淫','嫖娼','色情','裸聊','援交','约炮',
];

const DATA_DIR = path.resolve(__dirname, 'data');
const CUSTOM_FILE = path.join(DATA_DIR, 'sensitive_custom.json');

// ===== 从加密词库文件加载 =====
const ENC_FILE = 'tencent_sensitive_words.enc';

function loadExternalWords() {
  const encPath = path.resolve(__dirname, ENC_FILE);
  if (!fs.existsSync(encPath)) {
    console.log(`[sensitiveWords] 加密词库 ${ENC_FILE} 不存在，仅使用内置词`);
    return [];
  }

  const key = process.env.SENSITIVE_KEY;
  if (!key) {
    console.warn('[sensitiveWords] ⚠️ 未设置环境变量 SENSITIVE_KEY，无法解密词库，仅使用内置词');
    return [];
  }

  try {
    const content = decryptFile(encPath, key);
    const words = content.split(/[、,，\s\n\r]+/).filter(w => w.trim().length >= 2);
    console.log(`[sensitiveWords] 已加载加密词库，共 ${words.length} 个词`);
    return words;
  } catch (e) {
    console.error(`[sensitiveWords] 解密词库失败:`, e.message);
    console.error('[sensitiveWords] 请检查 SENSITIVE_KEY 是否正确');
    return [];
  }
}

// ===== 从自定义词库文件加载（后台手动添加的违禁词）=====
function loadCustomWords() {
  try {
    if (!fs.existsSync(CUSTOM_FILE)) return [];
    const raw = fs.readFileSync(CUSTOM_FILE, 'utf-8');
    const words = JSON.parse(raw);
    if (!Array.isArray(words)) return [];
    return words.filter(w => typeof w === 'string' && w.trim().length >= 1);
  } catch (e) {
    console.error('[sensitiveWords] 加载自定义违禁词失败:', e.message);
    return [];
  }
}

// ===== 构建去重词集 =====
const externalWords = loadExternalWords();
let customWords = loadCustomWords();
let ALL_WORDS = [...new Set([...CORE_WORDS, ...externalWords, ...customWords])];

// ===== 重新加载词库（添加/删除自定义词后调用）=====
function reload() {
  customWords = loadCustomWords();
  ALL_WORDS = [...new Set([...CORE_WORDS, ...externalWords, ...customWords])];
  console.log(`[sensitiveWords] 已重新加载词库，总计 ${ALL_WORDS.length} 个词`);
}

// ===== 检测函数 =====
function check(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  for (const word of ALL_WORDS) {
    if (text.includes(word)) found.push(word);
    if (found.length >= 20) break;
  }
  return found;
}

// ===== 统计信息 =====
function getStats() {
  return {
    internal: CORE_WORDS.length,
    external: externalWords.length,
    custom: customWords.length,
    total: ALL_WORDS.length,
    words: ALL_WORDS,
  };
}

module.exports = { check, getStats, reload, CUSTOM_FILE };
