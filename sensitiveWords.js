// 敏感词过滤模块
const fs = require('fs');
const path = require('path');

// ===== 内置核心敏感词 =====
const CORE_WORDS = [
  '赌博','赌场','博彩','赌球','时时彩','百家乐','网赌',
  '毒品','大麻','海洛因','冰毒','K粉','摇头丸','吸毒','贩毒',
  '枪支','手枪','炸弹','炸药','恐怖袭击','恐怖分子',
  '诈骗','电信诈骗','网络诈骗','金融诈骗','假药','假币',
  '卖淫','嫖娼','色情','裸聊','援交','约炮',
];

// ===== 从外部文件加载词库 =====
// 支持格式：逗号、顿号、空格、换行分隔
const EXTERNAL_FILE = 'tencent_sensitive_words.txt';
// 最小词长：2个字符以下的词容易误报正常中文
const MIN_WORD_LEN = 2;

function loadExternalWords(filePath) {
  try {
    const absPath = path.resolve(__dirname, filePath);
    if (!fs.existsSync(absPath)) {
      console.log(`[sensitiveWords] 外部词库 ${filePath} 不存在，仅使用内置词`);
      return [];
    }
    const content = fs.readFileSync(absPath, 'utf-8');
    const words = content.split(/[、,，\s\n\r]+/).filter(w => w.trim().length >= MIN_WORD_LEN);
    console.log(`[sensitiveWords] 已加载外部词库，共 ${words.length} 个词（过滤掉单字词）`);
    return words;
  } catch (e) {
    console.error(`[sensitiveWords] 加载外部词库失败:`, e.message);
    return [];
  }
}

// ===== 构建去重词集 =====
const externalWords = loadExternalWords(EXTERNAL_FILE);
const ALL_WORDS = [...new Set([...CORE_WORDS, ...externalWords])];

// ===== 检测函数 =====
function check(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  for (const word of ALL_WORDS) {
    if (text.includes(word)) found.push(word);
    // 最多返回前20个命中词，避免消息过长
    if (found.length >= 20) break;
  }
  return found;
}

// ===== 统计信息 =====
function getStats() {
  return {
    internal: CORE_WORDS.length,
    external: externalWords.length,
    total: ALL_WORDS.length,
  };
}

module.exports = { check, getStats };
