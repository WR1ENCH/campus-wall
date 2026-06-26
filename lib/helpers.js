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

module.exports = { getClientIP, hasSpecialChars, parseLocalDateTime };
