// ===== lib/subscription.js - PLUS++ 订阅系统共享逻辑 =====
const crypto = require('crypto');
const db = require('../db');

const CARD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_MOD = CARD_CHARS.length;

function luhnModN(code) {
  let factor = 2;
  let sum = 0;
  const n = CARD_MOD;
  for (let i = code.length - 2; i >= 0; i--) {
    const val = CARD_CHARS.indexOf(code[i]);
    if (val === -1) return false;
    const add = val * factor;
    sum += Math.floor(add / n) + (add % n);
    factor = factor === 2 ? 1 : 2;
  }
  const expected = (n - (sum % n)) % n;
  return CARD_CHARS[expected] === code[code.length - 1];
}

function generatePlusCardCode(existingCards) {
  const codeSet = new Set((existingCards || []).map(c => c.code));
  let attempts = 0;
  while (attempts < 1000) {
    const raw = [];
    for (let i = 0; i < 11; i++) {
      raw.push(CARD_CHARS[crypto.randomInt(CARD_MOD)]);
    }
    let factor = 2;
    let sum = 0;
    const n = CARD_MOD;
    for (let i = raw.length - 1; i >= 0; i--) {
      const val = CARD_CHARS.indexOf(raw[i]);
      const add = val * factor;
      sum += Math.floor(add / n) + (add % n);
      factor = factor === 2 ? 1 : 2;
    }
    const check = CARD_CHARS[(n - (sum % n)) % n];
    const rawCode = raw.join('') + check;
    const code = 'PLUS-' + rawCode.slice(0, 4) + '-' + rawCode.slice(4, 8) + '-' + rawCode.slice(8, 12);
    attempts++;
    if (!codeSet.has(code)) return code;
  }
  throw new Error('无法生成唯一卡密，请稍后重试');
}

function pushUserNotice(targetUserId, title, content, level) {
  if (!targetUserId) return;
  const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const notices = db.readNotices();
  notices.push({
    id: notificationId,
    title, content, author: '系统', auto: true,
    level: level || 'T1',
    createdAt: new Date().toISOString(),
    targetUserId
  });
  db.writeNotices(notices);
  db.addUserNotification({
    notificationId,
    userId: targetUserId,
    read: 0,
    createdAt: new Date().toISOString()
  });
}

function isUserPlus(userId) {
  const subs = db.readSubscriptions();
  const now = new Date().toISOString();
  const result = subs.some(s => s.userId === userId && s.status === 'active' && s.endTime > now);
  return result;
}

module.exports = { CARD_CHARS, CARD_MOD, luhnModN, generatePlusCardCode, pushUserNotice, isUserPlus };
