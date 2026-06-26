const { hashPassword, verifyPassword, encryptCert, decryptCert, makeToken, verifySignedToken, getDisplayZhixueStatus } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { requireAdmin, requireSuper } = require('../lib/middleware');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const maintenance = require('../maintenance');
const { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist } = require('../sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames } = require('../bullyingNames');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SENSITIVE_CUSTOM_FILE = path.join(DATA_DIR, 'sensitive_custom.json');

function hasAdmins() { return db.readAdmins().length > 0; }

function generateUID() {
  const banned = [/^(\d)\1{7}$/, /12345678/, /87654321/, /01234567/, /23456789/];
  let uid, attempts = 0;
  do {
    uid = (Math.floor(Math.random() * 9) + 1).toString();
    for (let i = 1; i < 8; i++) uid += Math.floor(Math.random() * 10).toString();
    attempts++;
    if (banned.some(p => p.test(uid))) continue;
    const users = db.readUsers();
    if (users.some(u => u.uid === uid)) continue;
    break;
  } while (attempts < 1000);
  return uid || null;
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
  db.addDeletedItem({
    id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    content: typeof item.content === 'string' ? item.content.substring(0, 500) : '',
    author: item.author || item.nickname || item.createdBy || '未知',
    userId: item.userId || item.createdBy || null,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy,
    extra: extra || ''
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
  const reports = readReports();
  const { status } = req.query;
  const filtered = status ? reports.filter(r => r.status === status) : reports;

  // 按状态排序：pending 优先，再按时间倒序
  filtered.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ ok: true, data: filtered });
});

app.post('/api/admin/reports/:id/handle', requireAdmin, (req, res) => {
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

  // 如果 action 是 delete_post，同时软删除被举报的帖子
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
  // 如果 action 是 delete_comment，同时软删除被举报的评论
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
  // 如果 action 是 delete_discussion_comment，同时软删除被举报的讨论区评论
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
  res.json({ ok: true });
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
    location: r.location,
    incidentTime: r.incidentTime,
    anonymous: !!r.anonymous,
    hasContact: !!(r.contact && r.contact.trim()),
    hasImages: r.images && r.images.length > 0,
    imageCount: r.images ? r.images.length : 0,
    time: r.time,
    status: r.status || 'pending',
    handledBy: r.handledBy,
    handledAt: r.handledAt
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
  users[userIndex].zhixuePassword = null;
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
    // 手动认证直接通过，奖励 Credits
    users[userIndex].credit = (users[userIndex].credit || 0) + 300;
  }

  writeUsers(users);

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

};
