// ===== lib/state.js - 内存状态存储 =====


const emailVerificationStore = new Map();  // key = userId, value = { email, code, expiresAt }
const emailCodeRateLimit = new Map();       // key = userId, value = lastSendTimestamp
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
// 滑块 captcha 下发限流。key=ip，value=下发时间戳数组。防止机器人批量刷 captcha token。
const captchaGrantLimit = new Map();
const CAPTCHA_GRANT_WINDOW_MS = 60 * 1000; // 1 分钟窗口
const CAPTCHA_GRANT_MAX = 15;              // 窗口内允许 15 次下发

// 投票 IP 时间窗口限流 —— 防代理池轮换刷票
// key=voteId，value=[{ ip, subnet24, time }]，按投票维度追踪独立 IP 及 /24 子网内频率
const voteIpTimestamps = new Map();
const VOTE_IP_WINDOW_MS = 10 * 60 * 1000;       // 10 分钟滑动窗口
const VOTE_IP_SAME_SUBNET_MAX = 15;              // 同一 /24 子网在窗口内最多投 15 票
const VOTE_IP_TOTAL_UNIQUE_MAX = 60;              // 窗口内全部独立 IP 最多 60 个

// 浏览器指纹去重 —— 同一浏览器不可重复投票（防脚本换 IP 刷票）
// key=voteId，value=Map<fingerprint, lastSeen> —— 存活时长随服务器，重启后 userId/IP 去重仍有效
const voteFingerprints = new Map();

// 主页留言频率限制：key='wm_{senderId}_{targetUserId}', value=timestamp
const wallMessageRateLimit = new Map();
// 主页访客列表+留言查看日通行证：key=userId, value=日期字符串'YYYY-MM-DD'
const wallMessageDayPass = new Map();

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
  // 滑块下发限流记录清理
  for (const [key, timestamps] of captchaGrantLimit) {
    const filtered = timestamps.filter(ts => now - ts < CAPTCHA_GRANT_WINDOW_MS);
    if (filtered.length === 0) captchaGrantLimit.delete(key);
    else captchaGrantLimit.set(key, filtered);
  }
  // 投票 IP 限流记录清理
  for (const [voteId, entries] of voteIpTimestamps) {
    const filtered = entries.filter(e => now - e.time < VOTE_IP_WINDOW_MS);
    if (filtered.length === 0) voteIpTimestamps.delete(voteId);
    else voteIpTimestamps.set(voteId, filtered);
  }
  // 主页留言频率限制清理（60秒过期）
  for (const [key, ts] of wallMessageRateLimit) {
    if (now - ts > 60000) wallMessageRateLimit.delete(key);
  }
  // 主页访客日通行证过期清理
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const [key, dateStr] of wallMessageDayPass) {
    if (dateStr !== todayStr) wallMessageDayPass.delete(key);
  }
}, 60000);

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore) {
    if (now - entry.t > 300000) captchaStore.delete(id);
  }
}, 60000);
setInterval(() => {
  const now = Date.now();
  // 邮箱验证码过期清理（10分钟过期）
  for (const [userId, entry] of emailVerificationStore) {
    if (now - entry.expiresAt > 0) emailVerificationStore.delete(userId);
  }
  // 邮箱验证码发送频率限制清理（60秒过期）
  for (const [userId, ts] of emailCodeRateLimit) {
    if (now - ts > 60000) emailCodeRateLimit.delete(userId);
  }
}, 60000);

module.exports = { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, cardCreateLimits, onlineUsers, loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX, voteIpTimestamps, VOTE_IP_WINDOW_MS, VOTE_IP_SAME_SUBNET_MAX, VOTE_IP_TOTAL_UNIQUE_MAX, voteFingerprints, wallMessageRateLimit, wallMessageDayPass, emailVerificationStore, emailCodeRateLimit };
