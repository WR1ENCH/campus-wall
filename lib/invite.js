// ===== lib/invite.js - 邀请码工具模块 =====
// 邀请码：8 位纯字母数字（7 随机 + 1 Luhn 校验位），无前缀、无连字符。
// 字符集与 Luhn 算法复用 routes/user.js:74-90（卡密体系），保证前后端校验零差异。
const nodeCrypto = require('crypto');

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_MOD = 32;

// 每日/累计奖励上限（可在此调整）
const DAILY_REWARD_LIMIT = 5;
const TOTAL_REWARD_LIMIT = 20;

// luhnModN — 必须与 routes/user.js:74-90 保持一致；如有改动两处同步。
function luhnModN(code) {
  const chars = INVITE_CHARS;
  const n = chars.length;
  let factor = 2;
  let sum = 0;
  for (let i = code.length - 2; i >= 0; i--) {
    const val = chars.indexOf(code[i]);
    if (val === -1) return false;
    const add = val * factor;
    sum += Math.floor(add / n) + (add % n);
    factor = factor === 2 ? 1 : 2;
  }
  const expected = (n - (sum % n)) % n;
  return chars[expected] === code[code.length - 1];
}

// 8 位纯字母数字：7 随机 + 1 Luhn 校验位（无前缀、无连字符）
function generateInviteCode(existingCodes) {
  const set = new Set(existingCodes || []);
  for (let attempts = 0; attempts < 1000; attempts++) {
    const raw = [];
    for (let i = 0; i < 7; i++) raw.push(INVITE_CHARS[nodeCrypto.randomInt(INVITE_MOD)]);
    let factor = 2, sum = 0;
    for (let i = raw.length - 1; i >= 0; i--) {
      const val = INVITE_CHARS.indexOf(raw[i]);
      sum += Math.floor((val * factor) / INVITE_MOD) + (val * factor) % INVITE_MOD;
      factor = factor === 2 ? 1 : 2;
    }
    const check = INVITE_CHARS[(INVITE_MOD - (sum % INVITE_MOD)) % INVITE_MOD];
    const code = raw.join('') + check;
    if (!set.has(code)) return code;
  }
  // 不设兜底：32^7 ≈ 340 亿组合，理论上不可能耗尽；若循环 1000 次仍未找到唯一码视为异常，抛错让注册失败（不可静默发放无效码）。
  throw new Error('failed to generate unique invite code after 1000 attempts');
}

function validateInviteCodeShape(code) {
  if (typeof code !== 'string') return false;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(c)) return false;
  return luhnModN(c);
}

function isSelfReferral(inviterUser, inviteeUserId) { return inviterUser.id === inviteeUserId; }

function deviceHash(req) {
  const ua = (req.headers['user-agent'] || '').slice(0, 200);
  const al = (req.headers['accept-language'] || '').slice(0, 80);
  return nodeCrypto.createHash('sha256').update(ua + '|' + al).digest('hex').slice(0, 16);
}

module.exports = {
  INVITE_CHARS,
  INVITE_MOD,
  DAILY_REWARD_LIMIT,
  TOTAL_REWARD_LIMIT,
  luhnModN,
  generateInviteCode,
  validateInviteCodeShape,
  isSelfReferral,
  deviceHash
};
