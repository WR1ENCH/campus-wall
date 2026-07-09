// ===== lib/hotness.js - 全站实时热度算法 =====
//
// 热度 H 反映校园墙此刻的「热闹程度」：新活动权重高，旧活动随时间指数衰减。
//
// 公式（后端每 5 分钟重算一次，结果缓存于内存）：
//
//   H = round(
//         0.6 × Σ_(近24h帖子) (likes + 2×comments) × e^(-ageHours/τ)
//       + 1.0 × 今日发帖数
//       + 0.5 × 当前在线人数
//       + 0.3 × 进行中的讨论数
//   )
//   τ = 8 小时（半衰期约 5.5h）
//
// 信号说明：
//   - 评论比点赞权重高（2×），近 24h 帖子按时间指数衰减，越新越敏感；
//   - 今日发帖数 / 在线人数做平滑补充，避免深夜无人时热度直接归零；
//   - 进行中讨论数体现深度互动（非一次性刷屏）。

const db = require('../db');
const { onlineUsers } = require('./state');

// 时间衰减常数 τ（小时）
const TAU_HOURS = 8;
// 计入互动的滑动窗口（小时）
const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 3600 * 1000;

function computeHotness() {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  let decaySum = 0;       // 近24h 帖子加权互动
  let todayPosts = 0;      // 今日发帖数

  try {
    const posts = db.readPosts();
    for (const p of posts) {
      if (p.deleted) continue;
      const t = typeof p.time === 'string' ? Date.parse(p.time) : 0;
      if (!t) continue;
      const ageMs = now - t;
      if (ageMs < 0) continue; // 未来时间忽略
      const ageHours = ageMs / 3600000;
      if (ageHours <= WINDOW_HOURS) {
        const decay = Math.exp(-ageHours / TAU_HOURS);
        const interactions = (Number(p.likes) || 0) + 2 * (Number(p.commentsCount) || 0);
        decaySum += interactions * decay;
      }
      if (typeof p.time === 'string' && p.time.startsWith(today)) todayPosts++;
    }
  } catch (e) {
    console.error('[hotness] 读取帖子失败:', e.message);
  }

  // 当前在线人数
  const onlineCount = onlineUsers.size;

  // 进行中的讨论数（未删除且未过期）
  let activeDiscussions = 0;
  try {
    const discussions = db.readDiscussions();
    for (const d of discussions) {
      if (d.deleted) continue;
      if (d.expiresAt && Date.parse(d.expiresAt) < now) continue;
      activeDiscussions++;
    }
  } catch (e) {
    console.error('[hotness] 读取讨论失败:', e.message);
  }

  const raw =
    0.6 * decaySum +
    1.0 * todayPosts +
    0.5 * onlineCount +
    0.3 * activeDiscussions;

  return Math.round(raw);
}

// ===== 内存缓存 + 周期重算 =====
const cache = { value: 0, computedAt: 0 };

function recompute() {
  try {
    cache.value = computeHotness();
    cache.computedAt = Date.now();
  } catch (e) {
    console.error('[hotness] 计算失败:', e.message);
  }
  return cache.value;
}

// 初次调用时惰性计算，保证服务启动即有值
function getCachedHotness() {
  if (cache.computedAt === 0) recompute();
  return cache.value;
}

module.exports = { computeHotness, recompute, getCachedHotness, hotnessCache: cache };
