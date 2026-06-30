// ===== lib/state.js - 内存状态存储 =====

const captchaStore = new Map();
const postRateLimit = new Map();
const qrCodeStore = new Map();
const redeemRateLimit = new Map();
const cardCreateLimits = new Map();
const onlineUsers = new Map();
// ponytail: 登录暴破限流。key=ip|account，value=失败时间戳数组。
// 与 postRateLimit 同款 Map+时间戳清理，无新依赖。升级路径：换 express-rate-limit + redis。
const loginFailures = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟窗口
const LOGIN_MAX_FAILS = 10;              // 窗口内允许 10 次失败

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of postRateLimit) {
    const filtered = timestamps.filter(ts => now - ts < 600000);
    if (filtered.length === 0) postRateLimit.delete(userId);
    else postRateLimit.set(userId, filtered);
  }
  // ponytail: 登录失败记录清理（与 postRateLimit 同模式）
  for (const [key, timestamps] of loginFailures) {
    const filtered = timestamps.filter(ts => now - ts < LOGIN_WINDOW_MS);
    if (filtered.length === 0) loginFailures.delete(key);
    else loginFailures.set(key, filtered);
  }
}, 60000);

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore) {
    if (now - entry.t > 300000) captchaStore.delete(id);
  }
}, 60000);

module.exports = { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, cardCreateLimits, onlineUsers, loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS };
