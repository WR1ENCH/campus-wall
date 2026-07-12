// ===== lib/penalty.js - 新版处罚机制 / 安全中心 核心逻辑 =====
const db = require('../db');
const { generateId } = require('./uniqueId');
const { broadcastSSE } = require('./sse');

// 功能限制枚举（与 functions_update_2.md 对齐）
const FEATURES = ['whisper', 'anonymous_post', 'qa', 'post', 'vote'];

// 功能 → 中文标签（供前端展示）
const FEATURE_LABELS = {
  whisper: '悄悄话',
  anonymous_post: '匿名发帖 / 拍卖',
  qa: '你问我答',
  post: '发帖 / 参与讨论',
  vote: '投票区',
};

function parseMeasures(m) {
  if (Array.isArray(m)) return m;
  if (typeof m === 'string' && m) {
    try { return JSON.parse(m); } catch { return m.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

// 给单个用户发系统通知（双写 notices + user_notifications，触发 SSE）
function emitUserNotice(targetUserId, title, content, level) {
  if (!targetUserId) return;
  const notificationId = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const notices = db.readNotices();
  notices.push({
    id: notificationId,
    title, content, author: '系统', auto: true,
    level: level === 'T0' ? 'T0' : 'T1',
    createdAt: new Date().toISOString(),
    targetUserId
  });
  db.writeNotices(notices);
  db.addUserNotification({ notificationId, userId: targetUserId, read: 0, createdAt: new Date().toISOString() });
  broadcastSSE('noticeUpdate', { t: Date.now() });
}

// 获取当前生效的处罚（自动过期翻转 + 返回）
function getActivePunishment(userId) {
  if (!userId) return null;
  const list = db.readPunishments().filter(p => p.userId === userId);
  for (const p of list) {
    if (p.status === 'active') {
      if (p.expiresAt && Date.now() >= new Date(p.expiresAt).getTime()) {
        db.updatePunishment(p.punishmentId, { status: 'expired' });
        continue;
      }
      return p;
    }
  }
  return null;
}

// 某功能是否被当前处罚禁止
function isFeatureBlocked(userId, feature) {
  const p = getActivePunishment(userId);
  if (!p) return false;
  if (p.level === 'T0') return true;
  return parseMeasures(p.measures).includes(feature);
}

function durationText(p) {
  if (!p.durationDays || p.durationDays === 0) return '永久';
  return p.durationDays + ' 天';
}

// 通知封装（内容统一含 ID）
function notifyReportReceived(reporterId, reportId, summary) {
  emitUserNotice(reporterId, '📋 举报已收到',
    '你提交的举报（举报ID：' + reportId + '）已收到，我们将尽快核实处理。\n\n' + (summary || ''), 'T1');
}
function notifyPunishmentIssued(userId, punishmentId, p) {
  emitUserNotice(userId, '⚠️ 账号功能受限',
    '经校园墙安全中心认定，你的账号由于违反《校园墙用户公约》，已被限制使用校园墙相关功能。\n\n处罚ID：' +
    punishmentId + '\n处罚级别：' + (p.level === 'T0' ? 'T0（全面限制）' : 'T1（部分限制）') +
    '\n处罚时长：' + durationText(p) + '\n查看详情请前往「安全中心」。', 'T0');
}
function notifyAppealSubmitted(userId, punishmentId) {
  emitUserNotice(userId, '📝 申诉已提交',
    '你的申诉（关联处罚ID：' + punishmentId + '）已提交，我们将尽快审核。', 'T1');
}
function notifyAppealResult(userId, punishmentId, approved, note) {
  emitUserNotice(userId, approved ? '✅ 申诉通过' : '❌ 申诉未通过',
    (approved ? '你的申诉（关联处罚ID：' + punishmentId + '）已通过，处罚已撤销。'
              : '你的申诉（关联处罚ID：' + punishmentId + '）未通过，处罚继续生效。') +
    (note ? '\n\n审核说明：' + note : ''), 'T0');
}

// 解析被举报内容的证据快照（内容 + 图片）
function getReportedContent(type, targetId) {
  if (!targetId) return { content: '', images: [] };
  // 敏感词检测类型归一化
  if (type.startsWith('sensitive_')) type = type.slice(10); // sensitive_post → post
  try {
    if (type === 'post' || type === 'featured') {
      const post = db.readPosts().find(p => p.id === targetId);
      if (post) return { content: post.content || '', images: parseImages(post.images), author: post.author, userId: post.userId };
    }
    if (type === 'comment') {
      for (const post of db.readPosts()) {
        if (Array.isArray(post.comments)) {
          const c = post.comments.find(c => c.id === targetId);
          if (c) return { content: c.content || '', images: parseImages(c.images), author: c.author, userId: c.userId };
        }
      }
    }
    if (type === 'discussion') {
      const d = db.readDiscussions().find(x => x.id === targetId);
      if (d) return { content: d.title || '', images: [], author: d.createdBy, userId: d.createdBy };
    }
    if (type === 'discussion_comment') {
      const c = db.readDiscussionComments().find(x => x.id === targetId);
      if (c) return { content: c.content || '', images: parseImages(c.images), author: c.author, userId: c.userId };
    }
    if (type === 'qa_question') {
      const q = db.readQAQuestions().find(x => x.id === targetId);
      if (q) return { content: (q.title || '') + '\n' + (q.content || ''), images: parseImages(q.images), author: q.author, userId: q.userId };
    }
    if (type === 'qa_answer') {
      const a = db.readQAAnswers().find(x => x.id === targetId);
      if (a) return { content: a.content || '', images: parseImages(a.images), author: a.author, userId: a.userId };
    }
    if (type === 'auction') {
      for (const auction of db.readPickupAuctions()) {
        if (Array.isArray(auction.bids)) {
          const b = auction.bids.find(b => b.id === targetId);
          if (b) return { content: b.content || '', images: parseImages(b.images), author: b.anonymous ? '匿名用户' : b.username, userId: b.userId };
        }
      }
    }
  } catch (e) { /* 非致命 */ }
  return { content: '', images: [] };
}

function parseImages(images) {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try { const arr = JSON.parse(images); return Array.isArray(arr) ? arr : [images]; } catch { return [images]; }
  }
  return [];
}

module.exports = {
  FEATURES, FEATURE_LABELS, parseMeasures,
  emitUserNotice, getActivePunishment, isFeatureBlocked,
  notifyReportReceived, notifyPunishmentIssued, notifyAppealSubmitted, notifyAppealResult,
  getReportedContent, durationText,
};
