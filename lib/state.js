// ===== lib/state.js - 内存状态存储 =====

const captchaStore = new Map();
const postRateLimit = new Map();
const qrCodeStore = new Map();
const redeemRateLimit = new Map();
const cardCreateLimits = new Map();
const onlineUsers = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of postRateLimit) {
    const filtered = timestamps.filter(ts => now - ts < 600000);
    if (filtered.length === 0) postRateLimit.delete(userId);
    else postRateLimit.set(userId, filtered);
  }
}, 60000);

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore) {
    if (now - entry.t > 300000) captchaStore.delete(id);
  }
}, 60000);

module.exports = { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, cardCreateLimits, onlineUsers };
