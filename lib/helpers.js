// ===== lib/helpers.js - 通用工具函数 =====

function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket.remoteAddress || '-';
}

function hasSpecialChars(str) {
  return /[<>\"'&]/.test(str);
}

function parseLocalDateTime(str) {
  if (!str) return null;
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  return null;
}

// 判断某智学网账号是否已被其他账号占用（任意状态：approved/pending_confirm/pending/rejected 都算）
function findZhixueOwner(users, zhixueUsername, excludeUserId) {
  const target = String(zhixueUsername || '').trim();
  if (!target) return null;
  return users.find(u =>
    u.zhixueUsername &&
    String(u.zhixueUsername).trim() === target &&
    u.id !== excludeUserId
  ) || null;
}

module.exports = { getClientIP, hasSpecialChars, parseLocalDateTime, findZhixueOwner };
