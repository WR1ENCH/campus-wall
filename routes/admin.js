const { hashPassword, verifyPassword, encryptCert, decryptCert, makeToken, verifySignedToken, getDisplayZhixueStatus } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { requireAdmin, requireSuper } = require('../lib/middleware');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const maintenance = require('../maintenance');
const { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist } = require('../sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames } = require('../bullyingNames');
const penalty = require('../lib/penalty');
const credibility = require('../lib/credibility');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SENSITIVE_CUSTOM_FILE = path.join(DATA_DIR, 'sensitive_custom.json');

// Admin 路由速率限制（每分钟最多60 次请求）
const adminRateLimit = new Map();
const ADMIN_RATE_WINDOW = 60000;
const ADMIN_RATE_MAX = 60;

function checkAdminRateLimit(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();
  const timestamps = adminRateLimit.get(ip) || [];
  const recent = timestamps.filter(t => now - t < ADMIN_RATE_WINDOW);
  if (recent.length >= ADMIN_RATE_MAX) {
    return res.status(429).json({ ok: false, msg: '请求过于频繁，请稍后再试' });
  }
  recent.push(now);
  adminRateLimit.set(ip, recent);
  next();
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of adminRateLimit) {
    const recent = timestamps.filter(t => now - t < ADMIN_RATE_WINDOW);
    if (recent.length === 0) adminRateLimit.delete(ip);
    else adminRateLimit.set(ip, recent);
  }
}, 60000);

function hasAdmins() { return db.readAdmins().length > 0; }

function generateUID() {
  return require('../lib/uniqueId').generateUID();
}
function genCredId() {
  return require('../lib/uniqueId').generateId('CRDL');
}

function addLoginLog(type, account, success, ip, ua) {
  const logs = db.readLogs();
  logs.unshift({ id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, account: account || '未登录用户', success, ip: ip || '-', ua: ua || '-', time: new Date().toISOString() });
  if (logs.length > 500) logs.splice(500);
  db.writeLogs(logs);
}

function readPosts() { return db.readPosts(); }
function writePosts(posts) { db.writePosts(posts); broadcastSSE('postUpdate', { t: Date.now() }); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readAdmins() { return db.readAdmins(); }
function writeAdmins(admins) { db.writeAdmins(admins); }
function readReports() { return db.readReports(); }
function writeReports(reports) { db.writeReports(reports); }
function readFeedbacks() { return db.readFeedbacks(); }
function writeFeedbacks(feedbacks) { db.writeFeedbacks(feedbacks); }
function readBullying() { return db.readBullying(); }
function writeBullying(data) { db.writeBullying(data); }
function readCreditLogs() { return db.readCreditLogs(); }
function writeCreditLogs(logs) { db.writeCreditLogs(logs); }
function readCreditCards() { return db.readCreditCards(); }
function writeCreditCards(cards) { db.writeCreditCards(cards); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }
// ponytail: 给单个用户发系统通知（/api/user/notifications 按 targetUserId 过滤）。
// 霸凌举报处仍内联同款逻辑，不改动已工作代码；此处仅服务 aeed436 路由拆分时遗漏的举报/认证通知。
function pushUserNotice(targetUserId, title, content, level) {
  if (!targetUserId) return;
  const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const notices = readNotices();
  notices.push({
    id: notificationId,
    title, content, author: '系统', auto: true,
    level: level || 'T1',
    createdAt: new Date().toISOString(),
    targetUserId
  });
  writeNotices(notices);
  // 同时写入 user_notifications 表
  db.addUserNotification({
    notificationId,
    userId: targetUserId,
    read: 0,
    createdAt: new Date().toISOString()
  });
}
function readMaintenance() { return db.readMaintenance(); }
function writeMaintenance(data) { db.writeMaintenance(data); }
function readApps() { return db.readApps(); }
function writeApps(data) { db.writeApps(data); }
function readPasskey() { return db.readPasskey(); }
function writePasskey(data) { db.writePasskey(data); }
function readVotes() { return db.readVotes(); }
function writeVotes(votes) { db.writeVotes(votes); broadcastSSE('voteUpdate', { t: Date.now() }); }
function readVoteRecords() { return db.readVoteRecords(); }
function writeVoteRecords(records) { db.writeVoteRecords(records); }
function readVoteIpRecords() { return db.readVoteIpRecords(); }
function writeVoteIpRecords(records) { db.writeVoteIpRecords(records); }
function readDiscussionComments() { return db.readDiscussionComments(); }
function writeDiscussionComments(comments) { db.writeDiscussionComments(comments); broadcastSSE('discussionUpdate', { t: Date.now() }); }
function readPickupAuctions() { return db.readPickupAuctions(); }
function writePickupAuctions(data) { db.writePickupAuctions(data); broadcastSSE('pickupUpdate', { t: Date.now() }); }
function readPickupReports() { return db.readPickupReports(); }
function writePickupReports(data) { db.writePickupReports(data); broadcastSSE('pickupUpdate', { t: Date.now() }); }
function readQAQuestions() { return db.readQAQuestions(); }
function writeQAQuestions(data) { db.writeQAQuestions(data); broadcastSSE('qaUpdate', { t: Date.now() }); }
function readQAAnswers() { return db.readQAAnswers(); }
function writeQAAnswers(data) { db.writeQAAnswers(data); broadcastSSE('qaUpdate', { t: Date.now() }); }
function readSC() { return db.readSC(); }
function writeSC(data) { db.writeSC(data); }
function readWhispers() { return db.readWhispers(); }
function writeWhispers(data) { db.writeWhispers(data); }
function readTrustTokens() { return db.readTrustTokens(); }
function writeTrustTokens(tokens) { db.writeTrustTokens(tokens); }
function readLogs() { return db.readLogs(); }
function writeLogs(logs) { db.writeLogs(logs); }
function readDeletedItems() { return db.readDeletedItems(); }
function writeDeletedItems(data) { db.writeDeletedItems(data); }
function addDeletedItem(item) { db.addDeletedItem(item); }
function readAnnouncement() { return db.readAnnouncement(); }
function writeAnnouncement(data) { db.writeAnnouncement(data); broadcastSSE('announcementUpdate', { t: Date.now() }); }
function readDiscussions() { return db.readDiscussions(); }
function writeDiscussions(discussions) { db.writeDiscussions(discussions); broadcastSSE('discussionUpdate', { t: Date.now() }); }

function saveDeletedItem(type, item, deletedBy, extra) {
  const extraData = Object.assign({
    time: item.time || item.createdAt || null,
    likeCount: item.likes || 0,
    commentCount: item.commentsCount || 0,
    title: item.title || null,
  }, typeof extra === 'object' ? extra : {});
  db.addDeletedItem({
    id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    content: typeof item.content === 'string' ? item.content.substring(0, 500) : '',
    author: item.author || item.nickname || item.createdBy || '未知',
    userId: item.userId || item.createdBy || null,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy,
    extra: JSON.stringify(extraData)
  });
}

function deleteSyncedDiscComment(postId) {
  try {
    var comments = readDiscussionComments();
    var matched = comments.filter(function(c) { return c.syncPostId === postId; });
    if (matched.length > 0) {
      matched.forEach(function(c) { saveDeletedItem('disc_comment', c, 'system'); });
      comments = comments.filter(function(c) { return c.syncPostId !== postId; });
      writeDiscussionComments(comments);
    }
  } catch(e) { console.warn('[delete] deleteSyncedDiscComment failed:', e.message); }
}

function changeCredit(userId, amount, reason) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  users[idx].credit = (users[idx].credit || 0) + amount;
  if (users[idx].credit < 0) users[idx].credit = 0;
  writeUsers(users);
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount,
    reason,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);
  return true;
}

const CARD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_MOD = CARD_CHARS.length;

function luhnModN(code) {
  let factor = 2;
  let sum = 0;
  const n = CARD_MOD;
  for (let i = code.length - 2; i >= 0; i--) {
    let val = CARD_CHARS.indexOf(code[i]);
    if (val === -1) return false;
    let add = val * factor;
    sum += Math.floor(add / n) + (add % n);
    factor = factor === 2 ? 1 : 2;
  }
  const expected = (n - (sum % n)) % n;
  const checkChar = code[code.length - 1];
  return CARD_CHARS[expected] === checkChar;
}

function generateCardCode(existingCards) {
  const codeSet = new Set((existingCards || []).map(c => c.code));
  let code;
  let attempts = 0;
  do {
    const raw = [];
    for (let i = 0; i < 11; i++) {
      raw.push(CARD_CHARS[crypto.randomInt(CARD_MOD)]);
    }
    let factor = 2;
    let sum = 0;
    const n = CARD_MOD;
    for (let i = raw.length - 1; i >= 0; i--) {
      let val = CARD_CHARS.indexOf(raw[i]);
      let add = val * factor;
      sum += Math.floor(add / n) + (add % n);
      factor = factor === 2 ? 1 : 2;
    }
    const check = CARD_CHARS[(n - (sum % n)) % n];
    const rawCode = raw.join('') + check;
    code = 'CW-' + rawCode.slice(0, 4) + '-' + rawCode.slice(4, 8) + '-' + rawCode.slice(8, 12);
    attempts++;
    if (attempts > 100) break;
  } while (codeSet.has(code));
  return code;
}

function _updateVoteOptions(vote, newOptions) {
  const normalizedNew = newOptions.map(function(opt) {
    return typeof opt === 'string'
      ? { text: opt, image: null }
      : { text: (opt.text || '').trim(), image: opt.image || null };
  });
  vote.options = normalizedNew.map(function(newOpt) {
    const existing = vote.options.find(function(o) {
      return o.text.trim() === newOpt.text && (o.image || null) === (newOpt.image || null);
    });
    return {
      id: existing ? existing.id : 'opt_' + Math.random().toString(36).slice(2, 8),
      text: newOpt.text,
      image: newOpt.image,
      votes: existing ? (existing.votes || 0) : 0
    };
  });
}

module.exports = function(app) {

  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = readUsers();
    const posts = readPosts();
    const list = users.map(u => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      regIp: u.regIp || '-',
      createdAt: u.createdAt,
      status: u.status,
      postCount: posts.filter(p => p.author === u.nickname || p.userId === u.id).length
    }));
    res.json({ ok: true, data: list });
  });

  app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
    const { banDays } = req.body;
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    user.status = 'banned';
    if (banDays !== undefined && banDays !== null) {
      const days = parseInt(banDays);
      if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '天数无效' });
      if (days === 0) {
        user.banUntil = null;
        user.banDays = null;
      } else {
        const until = new Date();
        until.setDate(until.getDate() + days);
        user.banUntil = until.toISOString();
        user.banDays = days;
      }
    }
    writeUsers(users);
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    user.status = 'active';
    user.banUntil = null;
    user.banDays = null;
    writeUsers(users);
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/reset-pwd', requireAdmin, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    const newPassword = Math.random().toString(36).slice(2, 10);
    user.password = hashPassword(newPassword);
    writeUsers(users);
    res.json({ ok: true, data: { password: newPassword } });
  });

  app.get('/api/admin/credit-logs', requireAdmin, (req, res) => {
    const logs = readCreditLogs();
    const users = readUsers();
    const list = logs.map(l => ({
      ...l,
      nickname: users.find(u => u.id === l.userId)?.nickname || '未知'
    }));
    res.json({ ok: true, data: list });
  });

  app.get('/api/admin/credit-cards', requireAdmin, requireSuper, (req, res) => {
    const cards = readCreditCards();
    const users = readUsers();
    const list = cards.reverse().map(c => ({
      ...c,
      usedByNickname: c.usedBy ? (users.find(u => u.id === c.usedBy)?.nickname || '未知') : null
    }));
    res.json({ ok: true, data: list });
  });

  const cardCreateLimits = new Map();
  const CARD_DAILY_LIMIT = 100;
  app.post('/api/admin/credit-cards/batch-create', requireAdmin, requireSuper, (req, res) => {
    const { count, value } = req.body;
    const num = parseInt(count) || 1;
    const val = parseInt(value) || 10;
    if (num < 1 || num > 100) return res.json({ ok: false, msg: '数量范围 1~100' });
    if (val < 1) return res.json({ ok: false, msg: '面值至少为 1 Credit' });
    const today = new Date().toISOString().slice(0, 10);
    const key = req.admin.id + '|' + today;
    const used = cardCreateLimits.get(key) || 0;
    if (used + num > CARD_DAILY_LIMIT) {
      return res.json({ ok: false, msg: '今日创建已达上限（' + CARD_DAILY_LIMIT + ' 张），请明天再试' });
    }
    cardCreateLimits.set(key, used + num);
    const cards = readCreditCards();
    const now = new Date().toISOString();
    const newCards = [];
    for (let i = 0; i < num; i++) {
      newCards.push({
        code: generateCardCode(cards.concat(newCards)),
        value: val,
        status: 'unused',
        createdBy: req.admin.id,
        createdAt: now,
        usedBy: null,
        usedAt: null
      });
    }
    const all = cards.concat(newCards);
    writeCreditCards(all);
    console.warn('[AUDIT] 超级管理员 ' + req.admin.id + ' 创建了 ' + num + ' 张卡密，每张 ' + val + ' Credit');
    res.json({ ok: true, data: { count: num, value: val, cards: newCards.map(c => c.code) } });
  });

app.get('/api/admin/reports', requireAdmin, (req, res) => {
  let reports = readReports();
  const { status } = req.query;
  let filtered = status ? reports.filter(r => r.status === status) : [...reports];

  // 按状态排序：pending 优先，再按时间倒序
  filtered.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // 丰富举报信息：附带举报人/被举报人信息、证据、目标内容
  const users = readUsers();
  const enriched = filtered.map(r => {
    let evidence = {};
    try { evidence = r.evidenceContent ? JSON.parse(r.evidenceContent) : {}; } catch { evidence = {}; }
    let reportedUserId = r.reportedUserId || null;
    // 旧格式举报没有 reportedUserId，从内容记录中查找
    if (!reportedUserId && r.targetId) {
      try {
        const content = penalty.getReportedContent(r.type, r.targetId);
        if (content && content.userId) reportedUserId = content.userId;
      } catch (e) { /* 非致命 */ }
    }
    // 旧格式举报无证据快照，运行时从源内容降级捞取
    if (!evidence.content && r.targetId) {
      try {
        const content = penalty.getReportedContent(r.type, r.targetId);
        if (content && content.content) evidence.content = content.content;
        if (content && content.images) evidence.images = content.images;
      } catch (e) { /* 非致命 */ }
    }
    const reporter = r.reportedBy ? users.find(u => u.id === r.reportedBy) : null;
    const reportedUser = reportedUserId ? users.find(u => u.id === reportedUserId) : null;
    const isCommentOrDiscussion = r.type === 'comment' || r.type === 'sensitive_comment' || r.type === 'discussion_comment' || r.type === 'sensitive_discussion_comment';
    const targetContent = evidence.content || (isCommentOrDiscussion ? (r.commentContent || '') : (r.postContent || ''));
    return { ...r, reportedUserId, targetContent, evidence, reporterInfo: reporter ? { nickname: reporter.nickname, username: reporter.username, uid: reporter.uid } : null, reportedUser: reportedUser ? { nickname: reportedUser.nickname, username: reportedUser.username, uid: reportedUser.uid } : null };
  });
  res.json({ ok: true, data: enriched });
});

app.post('/api/admin/reports/:id/handle', requireAdmin, (req, res) => {
  const { handledResult, action } = req.body;
  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id || r.reportId === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });

  const now = new Date().toISOString();
  report.handledBy = req.admin.id;
  report.handledAt = now;

  if (handledResult === 'no_violation') {
    report.status = 'resolved';
    report.handledResult = 'no_violation';
    // 敏感词自动举报：无违规则将帖子恢复为所有人可见
    if (report.type && report.type.startsWith('sensitive_') && report.targetId) {
      try {
        const _posts = db.readPosts();
        const _post = _posts.find(p => p.id === report.targetId);
        if (_post && _post.visibility === 'self_only') {
          _post.visibility = 'public';
          db.writePosts(_posts);
        }
      } catch (e) { console.warn('[admin] 恢复帖子可见性失败:', e.message); }
    }
    writeReports(reports);
    if (report.reportedBy) {
      penalty.emitUserNotice(report.reportedBy, '📋 举报已处理',
        '你提交的举报（举报ID：' + (report.reportId || report.id || '') + '）经管理员核实，未发现违规行为。', 'T1');
    }
    return res.json({ ok: true, msg: '已标记为无违规行为' });
  }

  if (handledResult === 'violation') {
    report.handledResult = 'violation';
    report.status = 'resolved';
    // 拍卖举报：执行拍卖-specific 违规处理（下架内容、封禁用户、自动替换）
    let auctionMsg = '';
    if (report.type === 'auction') {
      const bidId = report.targetId || report.pickupBidId;
      const auctions = readPickupAuctions();
      let targetBid = null, targetAuction = null;
      for (const auction of auctions) {
        if (Array.isArray(auction.bids)) {
          const bid = auction.bids.find(b => b.id === bidId);
          if (bid) { targetBid = bid; targetAuction = auction; break; }
        }
      }
      if (targetBid) {
        targetBid.reviewStatus = 'violated';
        targetBid.violatedAt = now;
        // 查找下一个审核通过的出价作为替换（处罚由处罚系统统一管理）
        const approvedBids = targetAuction.bids
          .filter(b => b.reviewStatus === 'approved' && b.id !== bidId)
          .sort((a, b) => b.amount - a.amount);
        if (approvedBids.length > 0) {
          auctionMsg += '，已自动替换为第二出价者内容';
        } else {
          auctionMsg += '，该时段暂无其他审核通过内容';
        }
        writePickupAuctions(auctions);
      }
    }
    writeReports(reports);
    // 通知举报人：已确认违规，处罚已下发
    if (report.reportedBy) {
      penalty.emitUserNotice(report.reportedBy, '📋 举报已确认',
        '你提交的举报（举报ID：' + (report.reportId || report.id || '') + '）经管理员核实确认违规，相关内容已下架。' + auctionMsg + '感谢你对校园环境的维护！', 'T1');
    }
    return res.json({ ok: true, msg: '违规已确认，内容已下架' + auctionMsg, reportId: report.reportId });
  }

  // 传统处理（resolved/ignored 向后兼容）
  if (['resolved', 'ignored'].includes(handledResult)) {
    report.status = handledResult;
    if (action) report.action = action;
    writeReports(reports);
    if (report.reportedBy) {
      const label = handledResult === 'resolved' ? '已处理' : '已忽略';
      penalty.emitUserNotice(report.reportedBy, '📋 举报' + label,
        '你提交的举报（举报ID：' + (report.reportId || report.id || '') + '）已由管理员处理。', 'T1');
    }
    return res.json({ ok: true });
  }

  return res.json({ ok: false, msg: '无效的处理方式' });
});

app.get('/api/admin/bullying', requireAdmin, (req, res) => {
  const reports = readBullying();
  const { status } = req.query;
  let filtered = reports;
  if (status && status !== 'all') {
    filtered = reports.filter(r => r.status === status);
  }
  const result = filtered.map(r => ({
    id: r.id,
    bullyType: r.bullyType,
    description: r.description,
    involved: r.involved,
    involvedUsers: r.involvedUsers || [],
    contentIds: r.contentIds || [],
    victimName: r.victimName || null,
    reporterRole: r.reporterRole || null,
    userId: r.userId || null,
    location: r.location,
    incidentTime: r.incidentTime,
    anonymous: !!r.anonymous,
    hasContact: !!(r.contact && r.contact.trim()),
    hasImages: r.images && r.images.length > 0,
    imageCount: r.images ? r.images.length : 0,
    time: r.time,
    status: r.status || 'pending',
    handledBy: r.handledBy,
    handledAt: r.handledAt,
    handledResult: r.handledResult || null
  }));
  res.json({ ok: true, data: result });
});

app.post('/api/admin/bullying/:id/handle', requireAdmin, (req, res) => {
  const { status, handleNote } = req.body;
  if (!status || !['pending','processing','resolved'].includes(status)) {
    return res.json({ ok: false, msg: '无效的状态' });
  }
  const reports = readBullying();
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '报告不存在' });
  reports[idx].status = status;
  reports[idx].handleNote = handleNote || '';
  reports[idx].handledBy = req.admin.name || req.admin.id;
  reports[idx].handledAt = new Date().toISOString();
  writeBullying(reports);

  // 确认确有霸凌（resolved）→ 发送 T0 通知
  if (status === 'resolved' && reports[idx].userId) {
    try {
      const notices = readNotices();
      notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: '🛡️ 霸凌举报已确认处理',
        content: '你提交的霸凌事件报告经管理员核实已确认，相关处理正在进行中。\n\n处理备注：' + (handleNote || '无') + '\n\n如情况仍未改善，请重新提交报告或联系学校相关部门。',
        author: '系统',
        auto: true,
            level: 'T0',
        createdAt: new Date().toISOString(),
      targetUserId: reports[idx].userId
      });
      writeNotices(notices);
    } catch (e) {
      console.error('发送霸凌处理通知失败:', e.message);
    }
  }

  res.json({ ok: true });
});

app.get('/api/admin/feedbacks', requireAdmin, (req, res) => {
  const feedbacks = readFeedbacks();
  const result = feedbacks.map(f => ({
    id: f.id,
    type: f.type,
    description: f.description,
    contact: f.contact,
    hasImages: f.images && f.images.length > 0,
    imageCount: f.images ? f.images.length : 0,
    time: f.time,
    status: f.status,
    handledBy: f.handledBy,
    handledAt: f.handledAt
  }));
  res.json({ ok: true, data: result });
});

app.post('/api/admin/feedbacks/:id/handle', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  if (!status || !['pending', 'resolved', 'rejected'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const feedbacks = readFeedbacks();
  const idx = feedbacks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '反馈不存在' });
  feedbacks[idx].status = status;
  feedbacks[idx].handledBy = req.admin.id;
  feedbacks[idx].handledAt = new Date().toISOString();
  feedbacks[idx].handleNote = note || '';
  writeFeedbacks(feedbacks);
  res.json({ ok: true });
});

app.get('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: true, data: [] });
    }
    const words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(words) ? words : [] });
  } catch (e) {
    res.json({ ok: false, msg: '读取失败: ' + e.message });
  }
});

app.post('/api/admin/sensitive-words/add', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '词语不能为空' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '词语太长，最多50字' });

    let words = [];
    if (fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    }
    if (!Array.isArray(words)) words = [];

    if (words.includes(trimmed)) return res.json({ ok: false, msg: '该违禁词已存在' });

    words.push(trimmed);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

app.post('/api/admin/sensitive-words/remove', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: false, msg: '没有自定义违禁词' });
    }
    let words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    if (!Array.isArray(words)) words = [];

    const idx = words.indexOf(trimmed);
    if (idx === -1) return res.json({ ok: false, msg: '未找到该违禁词' });

    words.splice(idx, 1);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

app.get('/api/admin/zhixue-pending', requireAdmin, (req, res) => {
  const users = readUsers();
  const pending = users.filter(u => u.zhixueStatus === 'pending');
  const list = pending.map(u => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    certType: u.zhixueCertType || 'zhixue',
    zhixueUsername: u.zhixueUsername,
    zhixuePassword: (u.zhixuePassword ? decryptCert(u.zhixuePassword) : '') || '',
    manualNote: u.zhixueManualNote || '',
    manualImages: u.zhixueManualImages || [],
    submittedAt: u.zhixueSubmittedAt
  }));
  res.json({ ok: true, data: list });
});

app.put('/api/admin/zhixue/:userId/review', requireAdmin, (req, res) => {
  const { action, realName, className, rejectReason } = req.body; // action: approve | reject
  if (!['approve', 'reject'].includes(action)) {
    return res.json({ ok: false, msg: '无效的操作' });
  }

  // 拒绝时必须填写原因
  if (action === 'reject') {
    if (!rejectReason || !rejectReason.trim()) {
      return res.json({ ok: false, msg: '请填写驳回原因' });
    }
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  const now = new Date().toISOString();

  if (action === 'reject') {
    users[userIndex].zhixueStatus = 'rejected';
    users[userIndex].zhixueRejectReason = rejectReason.trim();
    users[userIndex].zhixueRejectedAt = now;
    users[userIndex].zhixueReviewedAt = now;
    users[userIndex].zhixueReviewedBy = req.admin.id;
    writeUsers(users);
    // ponytail: aeed436 路由拆分时遗漏——认证驳回未通知用户
    pushUserNotice(users[userIndex].id, '❌ 学生认证未通过', '你的学生认证申请已被驳回。原因：' + rejectReason.trim());
    return res.json({ ok: true, msg: '已拒绝该申请' });
  }

  // === approve 流程 ===
  // 通过时：智学认证必须填写姓名；手动认证有 manualName 兜底，管理员可不填
  const u = users[userIndex];
  const isManual = u.zhixueCertType === 'manual';
  const hasManualName = u.zhixueManualName;
  if (!isManual && !hasManualName && (!realName || !realName.trim())) {
    return res.json({ ok: false, msg: '请填写学生姓名' });
  }

  // 智学认证 → pending_confirm（等待用户确认）
  // 手动认证 → approved（直接通过）
  users[userIndex].zhixueStatus = isManual ? 'approved' : 'pending_confirm';
  users[userIndex].zhixueReviewedAt = now;
  users[userIndex].zhixueReviewedBy = req.admin.id;
  users[userIndex].zhixueRejectReason = null;
  users[userIndex].zhixueRejectedAt = null;

  // 加密存储姓名班级（pending_confirm 时也存，供用户确认时展示）
  const nameToStore = (realName && realName.trim())
    ? realName.trim()
    : (u.zhixueManualName || null);
  if (nameToStore) {
    users[userIndex].certRealName = encryptCert(nameToStore);
  }
  users[userIndex].certClassName = className && className.trim() ? encryptCert(className.trim()) : null;

  if (isManual) {
    // 手动认证直接通过，奖励 Credits + 信用分
    users[userIndex].credit = (users[userIndex].credit || 0) + 300;
    writeUsers(users);
    credibility.addZhixueBonus(u.id);
  } else {
    writeUsers(users);
  }

  // ponytail: aeed436 路由拆分时遗漏——认证通过后未通知用户
  pushUserNotice(users[userIndex].id, isManual ? '✅ 学生认证已通过' : '✅ 学生认证初审通过',
    isManual
      ? '你的学生认证已通过审核，获得 300 Credits 奖励！'
      : '你的智学网认证已通过初审，请进入校园墙确认身份信息以完成认证。');

  if (isManual) {
    return res.json({ ok: true, msg: '已通过审核' });
  } else {
    return res.json({ ok: true, msg: '审核通过，等待用户确认信息', pendingConfirm: true });
  }
});

  app.get('/api/admin/whispers', requireAdmin, (req, res) => {
    const whispers = readWhispers();
    res.json({ ok: true, data: whispers.reverse() });
  });

app.get('/api/admin/notice-applications', requireAdmin, (req, res) => {
  const apps = readApps().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: apps });
});

app.post('/api/admin/notice-applications/:id/review', requireAdmin, (req, res) => {
  const { action, accountId, accountName, accountPwd } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.json({ ok: false, msg: '无效操作' });

  const apps = readApps();
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.json({ ok: false, msg: '申请不存在' });
  if (app.status !== 'pending') return res.json({ ok: false, msg: '该申请已处理' });

  if (action === 'reject') {
    app.status = 'rejected';
    app.reviewedAt = new Date().toISOString();
    app.reviewedBy = req.admin.id;
    writeApps(apps);

    // 存储通知到用户记录
    const users = readUsers();
    const targetUser = users.find(u => u.id === app.userId);
    if (targetUser) {
      targetUser._noticeAppNotification = {
        status: 'rejected',
        message: '你的通知发布申请已被驳回，可以重新提交申请',
        timestamp: new Date().toISOString()
      };
      writeUsers(users);
    }

    return res.json({ ok: true, msg: '已拒绝该申请' });
  }

  // 通过：标记校园墙用户为通知发布者
  const users = readUsers();
  const targetUser = users.find(u => u.id === app.userId);
  if (!targetUser) {
    return res.json({ ok: false, msg: '未找到对应的校园墙用户，请确认该用户已注册' });
  }

  targetUser.noticePublisher = true;
  targetUser.noticePublisherAddedAt = new Date().toISOString();
  targetUser._noticeAppNotification = {
    status: 'approved',
    message: '你的通知发布申请已通过！你可以使用校园墙账号密码登录 notice.html 管理通知',
    timestamp: new Date().toISOString()
  };
  writeUsers(users);

  app.status = 'approved';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = req.admin.id;
  writeApps(apps);

  res.json({ ok: true, msg: '已通过，该用户可使用校园墙账号密码登录通知管理页面' });
});

app.get('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const stored = readPasskey();
  res.json({ ok: true, data: { hasKey: !!stored && !!stored.key, key: stored ? stored.key : null, createdAt: stored ? stored.createdAt : null } });
});

app.post('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const { action, key } = req.body;
  if (action === 'clear') {
    writePasskey({});
    return res.json({ ok: true, msg: '通行码已清空，暂停申请' });
  }

  // 自动生成或手动设置
  const newKey = (key && key.trim()) ? key.trim() : Math.random().toString(36).slice(2, 10).toUpperCase();
  writePasskey({ key: newKey, createdAt: new Date().toISOString(), createdBy: req.admin.id });
  res.json({ ok: true, msg: '通行码已生成', data: { key: newKey } });
});

app.get('/api/admin/notice-publishers', requireAdmin, (req, res) => {
  const users = readUsers();
  const notices = readNotices();
  const publishers = users
    .filter(u => u.noticePublisher)
    .map(u => {
      // 统计该发布者的通知数（按 author 昵称匹配）
      const userNotices = notices.filter(n =>
        !n.deleted && !n.auto && !n.targetUserId &&
        (n.author === u.nickname || n.author === u.username)
      );
      const lastNotice = userNotices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        status: u.status || 'active',
        createdAt: u.noticePublisherAddedAt || u.createdAt || '',
        appsCount: (readApps().filter(a => a.userId === u.id && a.status === 'approved').length),
        noticeCount: userNotices.length,
        lastNoticeAt: lastNotice ? lastNotice.createdAt : null,
        lastNoticeTitle: lastNotice ? lastNotice.title : null
      };
    });
  res.json({ ok: true, data: publishers });
});

app.post('/api/admin/notice-publishers/add', requireAdmin, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: '请指定用户ID' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.noticePublisher) return res.json({ ok: false, msg: '该用户已是通知发布者' });

  user.noticePublisher = true;
  user.noticePublisherAddedAt = new Date().toISOString();
  writeUsers(users);
  res.json({ ok: true, msg: '已授予通知发布权限' });
});

app.post('/api/admin/notice-publishers/remove', requireAdmin, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: '请指定用户ID' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (!user.noticePublisher) return res.json({ ok: false, msg: '该用户不是通知发布者' });

  user.noticePublisher = false;
  writeUsers(users);
  res.json({ ok: true, msg: '已移除发布权限' });
});

app.get('/api/admin/notice-account-stats', requireAdmin, (req, res) => {
  const users = readUsers();
  const notices = readNotices();
  const apps = readApps();

  const publishers = users.filter(u => u.noticePublisher);
  const activePublishers = publishers.filter(u => u.status !== 'banned');
  const totalNotices = notices.filter(n => !n.deleted && !n.auto && !n.targetUserId).length;
  const pendingApps = apps.filter(a => a.status === 'pending').length;

  res.json({
    ok: true,
    data: {
      totalPublishers: publishers.length,
      activePublishers: activePublishers.length,
      totalNotices,
      pendingApps
    }
  });
});

app.get('/api/admin/maintenance/status', requireAdmin, (req, res) => {
  try {
    const data = readMaintenance() || { enabled: false };
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: true, data: { enabled: false } });
  }
});

app.post('/api/admin/maintenance/toggle', requireAdmin, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.json({ ok: false, msg: '参数无效' });
  }
  const current = readMaintenance() || {};
  const data = {
    enabled,
    autoStart: current.autoStart || null,
    autoEnd: current.autoEnd || null,
    noticeBypass: current.noticeBypass || false,
    updatedAt: new Date().toISOString(),
    updatedBy: req.admin.name || req.admin.id
  };
  writeMaintenance(data);
  res.json({ ok: true, msg: enabled ? '已开启维护模式' : '已关闭维护模式', data });
});

app.post('/api/admin/maintenance/schedule', requireAdmin, (req, res) => {
  const { autoStart, autoEnd } = req.body;
  const current = readMaintenance() || { enabled: false };
  current.autoStart = autoStart || null;
  current.autoEnd = autoEnd || null;
  current.updatedAt = new Date().toISOString();
  current.updatedBy = req.admin.name || req.admin.id;
  writeMaintenance(current);
  res.json({ ok: true, msg: '定时设置已保存', data: current });
});

app.post('/api/admin/maintenance/notice-bypass', requireAdmin, (req, res) => {
  const { noticeBypass } = req.body;
  const current = readMaintenance() || { enabled: false };
  current.noticeBypass = !!noticeBypass;
  current.updatedAt = new Date().toISOString();
  current.updatedBy = req.admin.name || req.admin.id;
  writeMaintenance(current);
  res.json({ ok: true, msg: noticeBypass ? '已放行 notice.html' : '已取消放行', data: current });
});

app.post('/api/admin/maintenance/bot-testing', requireAdmin, checkAdminRateLimit, (req, res) => {
  const { botTesting } = req.body;
  const current = readMaintenance() || { enabled: false };
  current.botTesting = !!botTesting;
  current.updatedAt = new Date().toISOString();
  current.updatedBy = req.admin.name || req.admin.id;
  writeMaintenance(current);
  res.json({ ok: true, msg: botTesting ? 'Bot-Testing 已开启（验证码已禁用）' : 'Bot-Testing 已关闭（验证码已恢复）', data: current });
});

app.post('/api/admin/maintenance/test-key/create', requireAdmin, (req, res) => {
  try {
    const result = maintenance.createTestKey();
    res.json({ ok: true, data: result });
  } catch (e) {
    res.json({ ok: false, msg: '生成失败: ' + e.message });
  }
});

app.get('/api/admin/maintenance/test-key/list', requireAdmin, (req, res) => {
  try {
    const keys = maintenance.listTestKeys();
    res.json({ ok: true, data: keys });
  } catch (e) {
    res.json({ ok: false, msg: '获取失败' });
  }
});

app.delete('/api/admin/maintenance/test-key/:key', requireAdmin, (req, res) => {
  try {
    maintenance.deleteTestKey(req.params.key);
    res.json({ ok: true, msg: '已删除' });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败' });
  }
});

// ===========================================================================
// 以下路由在 aeed436「路由拆分 + SPA」重构时从旧 server.js 删除后未迁移，
// 导致 admin.html 对应模块 404 → 返回 HTML → 前端 "Unexpected token '<'"。
// 按原逻辑恢复（helper 复用本文件已有定义）。
// ===========================================================================

// 编辑投票选项：根据原文匹配保持票数，新增选项票数为 0
function _legacyUpdateVoteOptions(vote, newOptions) {
  const normalizedNew = newOptions.map(function(opt) {
    return typeof opt === 'string'
      ? { text: opt, image: null }
      : { text: (opt.text || '').trim(), image: opt.image || null };
  });
  vote.options = normalizedNew.map(function(newOpt) {
    const existing = vote.options.find(function(o) {
      return o.text.trim() === newOpt.text && (o.image || null) === (newOpt.image || null);
    });
    return {
      id: existing ? existing.id : 'opt_' + Math.random().toString(36).slice(2, 8),
      text: newOpt.text,
      image: newOpt.image,
      votes: existing ? (existing.votes || 0) : 0
    };
  });
}

// ===== 同学认证审核 =====
app.get('/api/admin/zhixue-records', requireAdmin, (req, res) => {
  const users = readUsers();
  const records = users
    .filter(u => u.zhixueStatus && ['pending', 'approved', 'rejected', 'pending_confirm'].includes(u.zhixueStatus))
    .map(u => ({
      id: u.id, nickname: u.nickname, avatar: u.avatar,
      certType: u.zhixueCertType || 'zhixue',
      zhixueUsername: u.zhixueUsername,
      zhixuePassword: (u.zhixuePassword
        ? (decryptCert(u.zhixuePassword)
          || (/^[a-f0-9]{32}:[a-f0-9]+$/.test(u.zhixuePassword) ? '（旧密钥加密，无法解密）' : u.zhixuePassword))
        : '') || '',
      zhixueManualName: u.zhixueManualName,
      status: u.zhixueStatus,
      rejectReason: u.zhixueRejectReason || null,
      submittedAt: u.zhixueSubmittedAt,
      reviewedAt: u.zhixueReviewedAt,
      reviewedBy: u.zhixueReviewedBy
    }))
    .sort((a, b) => {
      const ta = a.submittedAt || a.reviewedAt || '';
      const tb = b.submittedAt || b.reviewedAt || '';
      return tb.localeCompare(ta);
    });
  res.json({ ok: true, data: records });
});

app.post('/api/admin/zhixue/:userId/reset', requireAdmin, (req, res) => {
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  const u = users[userIndex];
  if (!u.zhixueStatus || !['approved', 'rejected', 'pending_confirm'].includes(u.zhixueStatus)) {
    return res.json({ ok: false, msg: '该用户当前状态无需重置' });
  }
  u.zhixueStatus = 'pending';
  u.zhixueReviewedAt = null;
  u.zhixueReviewedBy = null;
  u.zhixueRejectReason = null;
  u.zhixueRejectedAt = null;
  u.certRealName = null;
  u.certClassName = null;
  u.zhixuePassword = u._origPassword || null;
  writeUsers(users);
  res.json({ ok: true, msg: '已重置为待审核状态' });
});

// ===== 用户管理 =====
app.post('/api/admin/users/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请指定要删除的用户' });
  }
  let users = readUsers();
  let posts = readPosts();
  let deletedCount = 0;
  let deletedPostCount = 0;
  users = users.filter(u => {
    if (ids.includes(u.id)) {
      deletedCount++;
      const before = posts.length;
      posts = posts.filter(p => p.userId !== u.id && p.author !== u.nickname);
      deletedPostCount += before - posts.length;
      return false;
    }
    return true;
  });
  writeUsers(users);
  writePosts(posts);
  res.json({ ok: true, deleted: deletedCount, deletedPosts: deletedPostCount });
});

app.put('/api/admin/user/:id/status', requireAdmin, (req, res) => {
  const { status, banDays } = req.body;
  if (!['active', 'banned'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  user.status = status;
  if (status === 'banned') {
    if (banDays !== undefined && banDays !== null) {
      const days = parseInt(banDays);
      if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '天数无效' });
      if (days === 0) { user.banUntil = null; user.banDays = null; }
      else {
        const until = new Date();
        until.setDate(until.getDate() + days);
        user.banUntil = until.toISOString();
        user.banDays = days;
      }
    }
  } else {
    user.banUntil = null;
    user.banDays = null;
  }
  writeUsers(users);
  res.json({ ok: true });
});

app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  let posts = readPosts();
  let softDeleted = 0;
  posts.forEach(p => {
    if (!p.deleted && (p.userId === userId || p.author === user.nickname)) {
      saveDeletedItem('post', p, 'system');
      softDeleted++;
    }
  });
  posts = posts.filter(p => !(p.userId === userId || p.author === user.nickname) || p.deleted);
  writePosts(posts);
  const updated = users.filter(u => u.id !== userId);
  writeUsers(updated);
  res.json({ ok: true, deletedPosts: softDeleted });
});

app.post('/api/admin/user/:id/reset-password', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  const newPassword = Math.random().toString(36).slice(2, 10);
  user.password = hashPassword(newPassword);
  writeUsers(users);
  res.json({ ok: true, data: { password: newPassword } });
});

app.get('/api/admin/user/:id/detail', requireAdmin, requireSuper, (req, res) => {
  try {
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    const { password, certRealName, certClassName, ...safeUser } = user;
    safeUser.certRealNameDecrypted = decryptCert(certRealName) || null;
    safeUser.certClassNameDecrypted = decryptCert(certClassName) || null;
    safeUser.zhixuePassword = safeUser.zhixuePassword ? (decryptCert(safeUser.zhixuePassword) || '') : '';
    const posts = readPosts();
    const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname)
      .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
      .slice(0, 20)
      .map(p => ({ id: p.id, content: p.content, type: p.type, time: p.time, likes: p.likes || 0, commentsCount: p.commentsCount || 0 }));
    const reports = readReports();
    const userReports = reports.filter(r => r.targetUserId === user.id || r.reportedBy === user.id)
      .sort((a, b) => new Date(b.createdAt || b.time || 0) - new Date(a.createdAt || a.time || 0))
      .slice(0, 20)
      .map(r => ({ id: r.id, time: r.createdAt || r.time, reason: r.reason, type: r.type, status: r.status }));
    const credibilityLogs = db.readCredibilityLogs()
      .filter(l => l.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const punishments = readPunishments().filter(p => p.userId === user.id).reverse();
    res.json({ ok: true, data: { ...safeUser, credibility_score: safeUser.credibility_score != null ? safeUser.credibility_score : 90, credibility_exchanged_total: safeUser.credibility_exchanged_total || 0, credibility_last_refresh: safeUser.credibility_last_refresh || null, credibilityLogs: credibilityLogs.slice(0, 50), postCount: userPosts.length, posts: userPosts, reports: userReports, punishments: punishments.slice(0, 20) } });
  } catch (e) {
    console.error('[admin] user detail error:', e);
    res.json({ ok: false, msg: '服务器内部错误' });
  }
});

// ===== Credit / 卡密管理 =====
app.post('/api/admin/credit-cards/create', requireAdmin, requireSuper, (req, res) => {
  const { count, value } = req.body;
  const num = parseInt(count) || 1;
  const val = parseInt(value) || 10;
  if (num < 1 || num > 100) return res.json({ ok: false, msg: '数量范围 1~100' });
  if (val < 1) return res.json({ ok: false, msg: '面值至少为 1 Credit' });
  const today = new Date().toISOString().slice(0, 10);
  const key = req.admin.id + '|' + today;
  const used = cardCreateLimits.get(key) || 0;
  if (used + num > CARD_DAILY_LIMIT) {
    return res.json({ ok: false, msg: '今日创建已达上限（' + CARD_DAILY_LIMIT + ' 张），请明天再试' });
  }
  cardCreateLimits.set(key, used + num);
  const cards = readCreditCards();
  const now = new Date().toISOString();
  const newCards = [];
  for (let i = 0; i < num; i++) {
    newCards.push({
      code: generateCardCode(cards.concat(newCards)),
      value: val, status: 'unused',
      createdBy: req.admin.id, createdAt: now, usedBy: null, usedAt: null
    });
  }
  writeCreditCards(cards.concat(newCards));
  console.warn('[AUDIT] 超级管理员 ' + req.admin.id + ' 创建了 ' + num + ' 张卡密，每张 ' + val + ' Credit');
  res.json({ ok: true, data: { count: num, value: val, cards: newCards.map(c => c.code) } });
});

app.get('/api/admin/credit/overview', requireAdmin, requireSuper, (req, res) => {
  const cards = readCreditCards();
  const totalRedeemed = cards.filter(c => c.status === 'used').reduce((s, c) => s + c.value, 0);
  const users = readUsers();
  const inCirculation = users.reduce((s, u) => s + (u.credit || 0), 0);
  const logs = readCreditLogs();
  const totalDeducted = logs.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    const label = i === 0 ? '今天' : (day.getMonth() + 1) + '/' + day.getDate();
    const dayLogs = logs.filter(l => l.createdAt && l.createdAt.startsWith(dayStr));
    chart.push({
      label,
      issued: dayLogs.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0),
      redeemed: dayLogs.reduce((s, l) => s + (l.amount < 0 ? Math.abs(l.amount) : 0), 0)
    });
  }
  res.json({ ok: true, data: { totalRedeemed, inCirculation, totalDeducted, chart } });
});

app.get('/api/admin/credit/search-user', requireAdmin, requireSuper, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ ok: true, data: [] });
  const users = readUsers();
  const matches = users.filter(u =>
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.nickname && u.nickname.toLowerCase().includes(q))
  ).slice(0, 20).map(u => ({ id: u.id, username: u.username, nickname: u.nickname, credit: u.credit || 0 }));
  res.json({ ok: true, data: matches });
});

app.post('/api/admin/credit/grant', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '请指定用户' });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '赠送数量范围 1~10000' });
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });
  users[idx].credit = (users[idx].credit || 0) + num;
  writeUsers(users);
  const logs = readCreditLogs();
  logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId, amount: num, reason: '管理员赠送：' + (reason || '无备注') + '（经办人：' + req.admin.id + '）', createdAt: new Date().toISOString() });
  writeCreditLogs(logs);
  console.warn('[AUDIT] 管理员 ' + req.admin.id + ' 赠送 ' + num + ' Credit 给用户 ' + userId);
  res.json({ ok: true, data: { credit: users[idx].credit } });
});

app.post('/api/admin/credit/deduct', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '请指定用户' });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '扣除数量范围 1~10000' });
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });
  const current = users[idx].credit || 0;
  if (current < num) return res.json({ ok: false, msg: '用户 Credit 余额不足，当前仅 ' + current });
  users[idx].credit = current - num;
  writeUsers(users);
  const logs = readCreditLogs();
  logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId, amount: -num, reason: '管理员扣除：' + (reason || '无备注') + '（经办人：' + req.admin.id + '）', createdAt: new Date().toISOString() });
  writeCreditLogs(logs);
  console.warn('[AUDIT] 管理员 ' + req.admin.id + ' 扣除用户 ' + userId + ' 的 ' + num + ' Credit');
  res.json({ ok: true, data: { credit: users[idx].credit } });
});

// ===== 信用分管理（管理员） =====
app.get('/api/admin/credibility-logs', requireAdmin, (req, res) => {
  const { userId } = req.query;
  let logs = db.readCredibilityLogs();
  if (userId) logs = logs.filter(l => l.userId === userId);
  logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: logs });
});

app.post('/api/admin/user/:id/credibility', requireAdmin, (req, res) => {
  const { action, amount, reason } = req.body;
  const targetUserId = req.params.id;
  if (!['set', 'add', 'deduct'].includes(action)) return res.json({ ok: false, msg: '操作类型无效' });
  const num = parseInt(amount);
  if (isNaN(num) || num < 0) return res.json({ ok: false, msg: '请输入有效数量' });
  const users = readUsers();
  const idx = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });
  const current = users[idx].credibility_score != null ? users[idx].credibility_score : 90;
  let newScore;
  let changeAmount;
  let logReason;
  if (action === 'set') {
    newScore = Math.max(0, Math.min(100, num));
    changeAmount = newScore - current;
    logReason = '管理员设置信用分为 ' + newScore + (reason ? '（' + reason + '）' : '');
  } else if (action === 'add') {
    newScore = current + num;
    changeAmount = num;
    logReason = '管理员增加 ' + num + ' 信用分' + (reason ? '（' + reason + '）' : '');
  } else {
    newScore = Math.max(0, current - num);
    changeAmount = -(current - newScore);
    logReason = '管理员扣除 ' + (current - newScore) + ' 信用分' + (reason ? '（' + reason + '）' : '');
  }
  users[idx].credibility_score = newScore;
  writeUsers(users);
  const log = {
    id: genCredId(),
    userId: targetUserId,
    amount: changeAmount,
    score: newScore,
    reason: logReason + '（经办人：' + req.admin.id + '）',
    type: 'admin',
    createdAt: new Date().toISOString(),
  };
  db.insertCredibilityLog(log);
  console.warn('[AUDIT] 管理员 ' + req.admin.id + ' 修改用户 ' + targetUserId + ' 信用分: ' + current + ' -> ' + newScore);
  res.json({ ok: true, data: { score: newScore, change: changeAmount } });
});

// ===== 数据总览 =====
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const posts = readPosts();
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const oneWeekAgo = now - 604800000;
  const stats = {
    total: posts.length,
    today: posts.filter(p => new Date(p.time).getTime() >= oneDayAgo).length,
    week: posts.filter(p => new Date(p.time).getTime() >= oneWeekAgo).length,
    totalLikes: posts.reduce((sum, p) => sum + (p.likes || 0), 0),
    byType: {}
  };
  ['日常', '表白', '树洞', '失物招领', '活动'].forEach(t => {
    stats.byType[t] = posts.filter(p => p.type === t).length;
  });
  stats.dailyChart = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    stats.dailyChart.push({
      label: i === 0 ? '今天' : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: posts.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length
    });
  }
  res.json({ ok: true, data: stats });
});

// ===== 评论管理 =====
app.get('/api/admin/comments', requireAdmin, (req, res) => {
  const posts = readPosts();
  const allComments = [];
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      allComments.push({ ...c, postId: post.id, postAuthor: post.author, postContent: post.content.slice(0, 50) });
    });
  });
  allComments.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ ok: true, data: allComments });
});

app.delete('/api/admin/comments/:commentId', requireAdmin, (req, res) => {
  const posts = readPosts();
  let found = false;
  posts.forEach(post => {
    const comment = (post.comments || []).find(c => c.id === req.params.commentId);
    if (comment && !comment.deleted) {
      saveDeletedItem('comment', comment, 'admin');
      post.comments = (Array.isArray(post.comments) ? post.comments : []).filter(c => c.id !== req.params.commentId);
      post.commentsCount = post.comments.length;
      found = true;
    }
  });
  if (!found) return res.json({ ok: false, msg: '评论不存在或已被删除' });
  writePosts(posts);
  const reports = readReports();
  const remaining = reports.filter(r => r.targetId !== req.params.commentId || r.type !== 'comment');
  writeReports(remaining);
  res.json({ ok: true });
});

app.post('/api/comments/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: false, msg: '请提供要删除的评论 ID 列表' });
  const posts = readPosts();
  let deletedCount = 0;
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      if (ids.includes(c.id) && !c.deleted) {
        saveDeletedItem('comment', c, 'admin');
        deletedCount++;
      }
    });
    post.comments = (Array.isArray(post.comments) ? post.comments : []).filter(c => !ids.includes(c.id) || c.deleted);
    post.commentsCount = (post.comments || []).length;
  });
  writePosts(posts);
  const reports = readReports();
  const remainingReports = reports.filter(r => !ids.includes(r.targetId) || r.type !== 'comment');
  writeReports(remainingReports);
  res.json({ ok: true, deleted: deletedCount });
});

app.post('/api/posts/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请提供要删除的帖子 ID 列表' });
  }
  let posts = readPosts();
  let deletedCount = 0;
  posts.forEach(p => {
    if (ids.includes(p.id) && !p.deleted) {
      saveDeletedItem('post', p, 'admin');
      deletedCount++;
    }
  });
  posts = posts.filter(p => !ids.includes(p.id) || p.deleted);
  writePosts(posts);
  res.json({ ok: true, deleted: deletedCount });
});

// ===== 举报处理 =====
app.put('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status, action } = req.body;
  if (!['resolved', 'ignored'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });
  report.status = status;
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  if (action) report.action = action;
  if (action === 'delete_post' && report.postId) {
    const posts = readPosts();
    const now = new Date().toISOString();
    posts.forEach(p => {
      if (p.id === report.postId && !p.deleted) {
        p.deleted = true;
        p.deletedAt = now;
        p.deletedBy = 'admin';
      }
    });
    writePosts(posts);
  }
  if (action === 'delete_comment' && report.targetId && report.type === 'comment') {
    const posts = readPosts();
    const now = new Date().toISOString();
    posts.forEach(post => {
      if (Array.isArray(post.comments)) {
        post.comments.forEach(c => {
          if (c.id === report.targetId && !c.deleted) {
            c.deleted = true;
            c.deletedAt = now;
            c.deletedBy = 'admin';
          }
        });
      }
    });
    writePosts(posts);
  }
  if (action === 'delete_discussion_comment' && report.targetId && report.type === 'discussion_comment') {
    const comments = readDiscussionComments();
    const now = new Date().toISOString();
    comments.forEach(c => {
      if (c.id === report.targetId && !c.deleted) {
        c.deleted = true;
        c.deletedAt = now;
        c.deletedBy = 'admin';
      }
    });
    writeDiscussionComments(comments);
  }
  writeReports(reports);
  // 举报处理后通知举报人
  if (report.reportedBy) {
    if (status === 'resolved') {
      pushUserNotice(report.reportedBy, '📋 举报已处理',
        '你提交的举报（' + (report.reason || '').slice(0, 50) + '…）已由管理员处理完毕。');
    } else if (status === 'ignored') {
      pushUserNotice(report.reportedBy, '📋 举报已忽略',
        '你提交的举报（' + (report.reason || '').slice(0, 50) + '…）经管理员核实，未发现违规行为，已标记为忽略。');
    }
  }
  res.json({ ok: true });
});

app.post('/api/admin/reports/:id/ban-user', requireAdmin, (req, res) => {
  const { banDays } = req.body;
  const days = banDays !== undefined ? parseInt(banDays) : 0;
  if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '天数无效' });
  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });
  const targetUserId = report.reportedBy;
  if (!targetUserId) return res.json({ ok: false, msg: '该举报没有关联用户（匿名举报）' });
  const users = readUsers();
  const user = users.find(u => u.id === targetUserId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  user.status = 'banned';
  if (days === 0) { user.banUntil = null; user.banDays = null; }
  else {
    const until = new Date();
    until.setDate(until.getDate() + days);
    user.banUntil = until.toISOString();
    user.banDays = days;
  }
  writeUsers(users);
  report.status = 'resolved';
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  report.action = 'ban_user';
  writeReports(reports);
  res.json({ ok: true, msg: days === 0 ? '已永久封禁该用户' : '已封禁该用户 ' + days + ' 天', user: { id: user.id, username: user.username, nickname: user.nickname } });
});

// ===== 已删除内容 =====
app.get('/api/admin/deleted-content', requireAdmin, (req, res) => {
  const items = readDeletedItems();
  const parseItem = (item) => {
    let extra = {};
    try { extra = typeof item.extra === 'string' ? JSON.parse(item.extra) : (item.extra || {}); } catch (_) {}
    return Object.assign({}, item, extra, { extra: undefined });
  };
  const posts = items.filter(i => i.type === 'post').map(parseItem);
  const comments = items.filter(i => i.type === 'comment').map(parseItem);
  const discussions = items.filter(i => i.type === 'discussion').map(parseItem);
  const discComments = items.filter(i => i.type === 'disc_comment').map(parseItem);
  const qaQuestions = items.filter(i => i.type === 'qa_question').map(parseItem);
  const qaAnswers = items.filter(i => i.type === 'qa_answer').map(parseItem);
  const auctions = items.filter(i => i.type === 'auction').map(parseItem);
  res.json({ ok: true, data: {
    posts: posts.reverse(), postComments: comments.reverse(),
    discussions: discussions.reverse(), discussionComments: discComments.reverse(),
    qaQuestions: qaQuestions.reverse(), qaAnswers: qaAnswers.reverse(),
    auctions: auctions.reverse()
  } });
});

// ===== 霸凌状态管理 =====
app.post('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const { status, handleNote } = req.body;
  if (!status || !['pending','processing','resolved'].includes(status)) {
    return res.json({ ok: false, msg: '无效的状态' });
  }
  const reports = readBullying();
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '报告不存在' });
  reports[idx].status = status;
  reports[idx].handleNote = handleNote || '';
  reports[idx].handledBy = req.admin.name || req.admin.id;
  reports[idx].handledAt = new Date().toISOString();
  writeBullying(reports);
  if (status === 'resolved' && reports[idx].userId) {
    try {
      const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const notices = readNotices();
      notices.push({
        id: notificationId,
        title: '🛡️ 霸凌举报已确认处理',
        content: '你提交的霸凌事件报告经管理员核实已确认，相关处理正在进行中。\n\n处理备注：' + (handleNote || '无') + '\n\n如情况仍未改善，请重新提交报告或联系学校相关部门。',
        author: '系统',
        auto: true,
        level: 'T0',
        createdAt: new Date().toISOString(),
        targetUserId: reports[idx].userId
      });
      writeNotices(notices);
      // 同时写入 user_notifications 表
      db.addUserNotification({
        notificationId,
        userId: reports[idx].userId,
        read: 0,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('发送霸凌处理通知失败:', e.message);
    }
  }
  res.json({ ok: true });
});

app.get('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const reports = readBullying();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '报告不存在' });

  // 丰富数据：举报人信息、涉事用户详情、相关内容详情
  const users = readUsers();
  const posts = readPosts();

  // 举报人信息
  let reporterInfo = null;
  if (report.userId) {
    const u = users.find(x => x.id === report.userId);
    if (u) reporterInfo = { id: u.id, nickname: u.nickname, username: u.username, avatar: u.avatar, uid: u.uid };
  }

  // 涉事用户详情（兼容字符串 JSON）
  let involvedUsers = report.involvedUsers;
  if (typeof involvedUsers === 'string') { try { involvedUsers = JSON.parse(involvedUsers); } catch { involvedUsers = []; } }
  if (!Array.isArray(involvedUsers)) involvedUsers = [];
  let involvedUserDetails = involvedUsers.map(iv => {
    const u = users.find(x => x.id === iv.id);
    if (u) return { id: u.id, nickname: u.nickname, username: u.username, status: u.status, uid: u.uid };
    return iv;
  });

  // 相关内容详情（兼容字符串 JSON）
  let contentIds = report.contentIds;
  if (typeof contentIds === 'string') { try { contentIds = JSON.parse(contentIds); } catch { contentIds = []; } }
  if (!Array.isArray(contentIds)) contentIds = [];
  let contentDetails = contentIds.map(cid => {
    const p = posts.find(x => x.id === cid);
    if (p) return { id: p.id, content: (p.content || '').substring(0, 200), hasImages: p.images && p.images.length > 0, author: p.author, type: p.type || 'post', deleted: !!p.deleted };
    return { id: cid, content: null, error: 'Not found or not a post' };
  });

  res.json({ ok: true, data: Object.assign({}, report, { reporterInfo, involvedUserDetails, contentDetails }) });
});

// 霸凌报告处理：封禁涉事用户 + 删除相关内容
app.post('/api/admin/bullying/:id/process', requireAdmin, (req, res) => {
  const { banUserIds, deleteContentIds, result } = req.body; // result: 'bullying' | 'not_bullying'
  if (!['bullying', 'not_bullying'].includes(result)) return res.json({ ok: false, msg: '无效的处理结果' });

  const reports = readBullying();
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '报告不存在' });

  // 封禁涉事用户
  const users = readUsers();
  const bannedUsers = [];
  if (Array.isArray(banUserIds)) {
    banUserIds.forEach(uid => {
      const u = users.find(x => x.id === uid);
      if (u && u.status !== 'banned') {
        u.status = 'banned';
        u.banUntil = null;
        bannedUsers.push({ id: u.id, nickname: u.nickname });
      }
    });
    writeUsers(users);
  }

  // 删除相关内容
  const posts = readPosts();
  const deletedContents = [];
  if (Array.isArray(deleteContentIds)) {
    deleteContentIds.forEach(cid => {
      const p = posts.find(x => x.id === cid);
      if (p && !p.deleted) {
        p.deleted = true;
        p.deletedAt = new Date().toISOString();
        p.deletedBy = req.admin.name || req.admin.id;
        // 写入 deleted_items
        db.addDeletedItem({
          id: p.id,
          type: 'post',
          content: (p.content || '').substring(0, 500),
          author: p.author || '匿名',
          userId: p.userId || null,
          deletedAt: new Date().toISOString(),
          deletedBy: req.admin.name || req.admin.id,
          extra: JSON.stringify({ time: p.time, likeCount: p.likes || 0, reason: '霸凌处理' })
        });
        deletedContents.push({ id: p.id });
      }
    });
    writePosts(posts);
  }

  // 更新霸凌报告状态
  reports[idx].status = 'resolved';
  reports[idx].handledResult = result;
  reports[idx].handledBy = req.admin.name || req.admin.id;
  reports[idx].handledAt = new Date().toISOString();
  reports[idx].handleNote = result === 'bullying' ? '确认霸凌，已处理' : '确认非霸凌';
  writeBullying(reports);

  // 发送通知
  if (reports[idx].userId) {
    const { emitUserNotice } = require('../lib/penalty');
    if (result === 'bullying') {
      emitUserNotice(reports[idx].userId, '🛡️ 霸凌举报处理结果',
        '你提交的霸凌事件报告（ID: ' + reports[idx].id + '）经管理员核实，确认为霸凌行为。\n\n相关涉事用户已封禁，相关内容已删除。\n\n感谢你对校园安全的贡献！', 'T0');
    } else {
      emitUserNotice(reports[idx].userId, '🛡️ 霸凌举报处理结果',
        '你提交的霸凌事件报告（ID: ' + reports[idx].id + '）经管理员核实，未认定为霸凌行为。\n\n如仍有疑问，请重新提交报告或联系学校相关部门。', 'T0');
    }
  }

  res.json({ ok: true, data: { bannedUsers, deletedContents, result } });
});

// ===== 反馈管理 =====
app.get('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  const feedbacks = readFeedbacks();
  const f = feedbacks.find(x => x.id === req.params.id);
  if (!f) return res.json({ ok: false, msg: '反馈不存在' });
  res.json({ ok: true, data: f });
});

app.post('/api/admin/feedback/:id/handle', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  if (!status || !['pending', 'resolved', 'rejected'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const feedbacks = readFeedbacks();
  const idx = feedbacks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '反馈不存在' });
  feedbacks[idx].status = status;
  feedbacks[idx].handledBy = req.admin.id;
  feedbacks[idx].handledAt = new Date().toISOString();
  feedbacks[idx].handleNote = note || '';
  writeFeedbacks(feedbacks);
  res.json({ ok: true });
});

// ===== 违禁词管理 =====
app.post('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '词语不能为空' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '词语太长，最多50字' });
    let words = [];
    if (fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    }
    if (!Array.isArray(words)) words = [];
    if (words.includes(trimmed)) return res.json({ ok: false, msg: '该违禁词已存在' });
    words.push(trimmed);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();
    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

app.delete('/api/admin/sensitive-words/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: false, msg: '没有自定义违禁词' });
    }
    let words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    if (!Array.isArray(words)) words = [];
    const idx = words.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '未找到该违禁词' });
    words.splice(idx, 1);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();
    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

app.get('/api/admin/sensitive-stats', requireAdmin, (req, res) => {
  try {
    const stats = getSensitiveStats();
    res.json({ ok: true, data: stats });
  } catch (e) {
    res.json({ ok: false, msg: '获取统计失败: ' + e.message });
  }
});

app.get('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: true, data: [] });
    const list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(list) ? list : [] });
  } catch (e) {
    res.json({ ok: false, msg: '读取白名单失败: ' + e.message });
  }
});

app.post('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '词语不能为空' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '词语太长，最多50字' });
    let list = [];
    if (fs.existsSync(WHITELIST_FILE)) list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];
    if (list.includes(trimmed)) return res.json({ ok: false, msg: '该词已在白名单中' });
    list.push(trimmed);
    saveWhitelist(list);
    reloadSensitive();
    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

app.delete('/api/admin/sensitive-whitelist/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: false, msg: '白名单为空' });
    let list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];
    const idx = list.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '未找到该白名单词' });
    list.splice(idx, 1);
    saveWhitelist(list);
    reloadSensitive();
    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

// ===== 霸凌保护姓名管理 =====
app.get('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const names = getAllBullyingNames();
    res.json({ ok: true, data: names });
  } catch (e) {
    res.json({ ok: false, msg: '读取失败: ' + e.message });
  }
});

app.post('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') return res.json({ ok: false, msg: '请输入有效姓名' });
    const trimmed = name.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '姓名不能为空' });
    if (trimmed.length > 30) return res.json({ ok: false, msg: '姓名太长，最多30字' });
    if (addBullyingName(trimmed)) {
      res.json({ ok: true, msg: '添加成功' });
    } else {
      res.json({ ok: false, msg: '该姓名已在保护名单中' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

app.delete('/api/admin/bullying-names/:name', requireAdmin, (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (removeBullyingName(name)) {
      res.json({ ok: true, msg: '删除成功' });
    } else {
      res.json({ ok: false, msg: '未找到该姓名' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

// ===== 问答管理 =====
app.get('/api/admin/qa/questions', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const list = questions.filter(q => !q.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: list.map(q => ({ ...q, answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length })) });
});

app.delete('/api/admin/qa/questions/:id', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const idx = questions.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '问题不存在' });
  if (questions[idx].status === 'open' && questions[idx].bounty > 0) {
    changeCredit(questions[idx].userId, questions[idx].bounty, '管理员删除问题退还悬赏');
  }
  questions[idx].deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

// ===== 投票管理 =====
app.delete('/api/admin/votes/:id', requireAdmin, (req, res) => {
  const votes = readVotes();
  const idx = votes.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '投票不存在' });
  votes[idx].deleted = true;
  writeVotes(votes);
  res.json({ ok: true });
});

app.put('/api/admin/votes/:id', requireAdmin, (req, res) => {
  const { title, options, multiple, allowCustom, endTime } = req.body;
  const votes = readVotes();
  const vote = votes.find(v => v.id === req.params.id);
  if (!vote) return res.json({ ok: false, msg: '投票不存在' });
  if (vote.deleted) return res.json({ ok: false, msg: '投票已删除' });
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length < 2) return res.json({ ok: false, msg: '标题至少2个字' });
    if (title.trim().length > 100) return res.json({ ok: false, msg: '标题最多100个字' });
    const sw = checkSensitive(title.trim());
    if (sw.length > 0) return res.json({ ok: false, warning: true, warningMsg: '标题包含敏感词，请修改后重试' });
    const bn = checkBullyingNames(title.trim());
    if (bn.length > 0) return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
    vote.title = title.trim();
  }
  if (options !== undefined) {
    if (!Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '至少需要2个选项' });
    if (options.length > 20) return res.json({ ok: false, msg: '最多20个选项' });
    for (const opt of options) {
      const optText = typeof opt === 'string' ? opt : (opt.text || '');
      if (!optText || !optText.trim()) return res.json({ ok: false, msg: '选项不能为空' });
      if (optText.trim().length > 100) return res.json({ ok: false, msg: '选项最多100个字' });
    }
    const optTexts = options.map(o => typeof o === 'string' ? o : (o.text || ''));
    const sw = checkSensitive(optTexts.join(' '));
    if (sw.length > 0) return res.json({ ok: false, warning: true, warningMsg: '选项包含敏感词，请修改后重试' });
    const bn = checkBullyingNames(optTexts.join(' '));
    if (bn.length > 0) return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
    _legacyUpdateVoteOptions(vote, options);
  }
  if (multiple !== undefined) vote.multiple = !!multiple;
  if (allowCustom !== undefined) vote.allowCustom = !!allowCustom;
  if (endTime !== undefined) vote.endTime = endTime || null;
  writeVotes(votes);
  res.json({ ok: true, data: vote });
});

};
