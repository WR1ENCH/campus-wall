// ===== routes/notices.js - 通知系统 =====
const { verifySignedToken, verifyUserToken } = require('../lib/crypto');
const { requireAdmin } = require('../lib/middleware');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');

function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }
function readAnnouncement() { return db.readAnnouncement(); }
function writeAnnouncement(data) { db.writeAnnouncement(data); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readSC() { return db.readSC(); }
function readVotes() { return db.readVotes(); }
function writeVotes(votes) { db.writeVotes(votes); broadcastSSE('voteUpdate', { t: Date.now() }); }

module.exports = function(app) {
  app.get('/api/announcement', (req, res) => {
    res.json({ ok: true, data: readAnnouncement() });
  });
  app.post('/api/announcement', requireAdmin, (req, res) => {
    const { title, content } = req.body;
    if (!content || !content.trim()) return res.json({ ok: false, msg: '公告内容不能为空' });
    writeAnnouncement({ title: title ? title.trim() : '公告', content: content.trim(), publishedAt: new Date().toISOString(), publishedBy: req.admin.name });
    res.json({ ok: true });
  });
  app.delete('/api/announcement', requireAdmin, (req, res) => {
    writeAnnouncement(null);
    res.json({ ok: true });
  });
  app.get('/api/notices', (req, res) => {
    const notices = readNotices();
    const active = notices.filter(n => !n.deleted && !n.targetUserId);
    const list = active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
    res.json({ ok: true, data: list });
  });
  app.post('/api/notices', (req, res) => {
    const token = req.headers['x-sc-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifySignedToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const sc = readSC();
    const users = readUsers();
    const isSC = sc && sc.id === session.id;
    const isPublisher = users.find(u => u.id === session.id && u.noticePublisher);
    if (!isSC && !isPublisher) return res.json({ ok: false, msg: '登录已过期' });
    const { title, content, author, level, images } = req.body;
    if (!title || !title.trim()) return res.json({ ok: false, msg: '请填写标题' });
    if (!content || !content.trim()) return res.json({ ok: false, msg: '请填写内容' });
    const combinedText = (title || '') + ' ' + (content || '');
    const sensitiveWords = checkSensitive(combinedText);
    if (sensitiveWords.length > 0) return res.json({ ok: false, warning: true, msg: '内容包含敏感词 [' + sensitiveWords.join(', ') + ']，请修改后重新提交', words: sensitiveWords });
    const blockedNames = checkBullyingNames(combinedText);
    if (blockedNames.length > 0) return res.json({ ok: false, bullying: true, msg: '内容涉及受保护人员姓名，无法发送' });
    var validImages = [];
    if (Array.isArray(images)) {
      images.forEach(function(img) {
        if (typeof img === 'string' && img.startsWith('data:') && img.length <= 10*1024*1024) validImages.push(img);
      });
    }
    const notices = readNotices();
    notices.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title.trim(), content: content.trim(), author: (author && author.trim()) ? author.trim() : session.name, level: level === 'T0' ? 'T0' : 'T1', images: validImages.length > 0 ? validImages : undefined, createdAt: new Date().toISOString() });
    writeNotices(notices);
    res.json({ ok: true, msg: '通知已发布' });
  });
  app.delete('/api/notices/:id', (req, res) => {
    const token = req.headers['x-sc-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifySignedToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const sc = readSC();
    const users = readUsers();
    const isSC = sc && sc.id === session.id;
    const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
    if (!isSC && !isPublisher) return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
    const notices = readNotices();
    const notice = notices.find(n => n.id === req.params.id);
    if (!notice) return res.json({ ok: false, msg: '通知不存在' });
    if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });
    notice.deleted = true;
    notice.deletedAt = new Date().toISOString();
    writeNotices(notices);
    res.json({ ok: true, msg: '通知已删除' });
  });
  app.post('/api/notices/:id/pin', (req, res) => {
    const token = req.headers['x-sc-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifySignedToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const sc = readSC();
    const users = readUsers();
    const isSC = sc && sc.id === session.id;
    const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
    if (!isSC && !isPublisher) return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
    const notices = readNotices();
    const notice = notices.find(n => n.id === req.params.id);
    if (!notice) return res.json({ ok: false, msg: '通知不存在' });
    if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });
    notice.pinned = !notice.pinned;
    if (notice.pinned) notice.pinnedAt = new Date().toISOString();
    else notice.pinnedAt = null;
    notice.updatedAt = new Date().toISOString();
    writeNotices(notices);
    res.json({ ok: true, msg: notice.pinned ? '已置顶' : '已取消置顶', pinned: notice.pinned });
  });
  app.post('/api/notices/:id/sync', (req, res) => {
    const token = req.headers['x-sc-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifySignedToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const sc = readSC();
    const users = readUsers();
    const isSC = sc && sc.id === session.id;
    const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
    if (!isSC && !isPublisher) return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
    const notices = readNotices();
    const notice = notices.find(n => n.id === req.params.id);
    if (!notice) return res.json({ ok: false, msg: '通知不存在' });
    if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });
    notice.synced = true;
    notice.syncedAt = new Date().toISOString();
    notice.updatedAt = new Date().toISOString();
    writeNotices(notices);
    res.json({ ok: true, msg: '同步成功' });
  });
  app.put('/api/notices/:id', (req, res) => {
    const token = req.headers['x-sc-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifySignedToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const sc = readSC();
    const users = readUsers();
    const isSC = sc && sc.id === session.id;
    const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
    if (!isSC && !isPublisher) return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
    const { title, content, author, level, images, sensitiveForce } = req.body;
    if (!title || !title.trim()) return res.json({ ok: false, msg: '请填写标题' });
    if (!content || !content.trim()) return res.json({ ok: false, msg: '请填写内容' });
    const combinedText = (title || '') + ' ' + (content || '');
    const sensitiveWords = checkSensitive(combinedText);
    if (sensitiveWords.length > 0 && !sensitiveForce) return res.json({ ok: false, warning: true, msg: '内容包含敏感词 [' + sensitiveWords.join(', ') + ']，请修改后重新提交', words: sensitiveWords });
    const blockedNames = checkBullyingNames(combinedText);
    if (blockedNames.length > 0) return res.json({ ok: false, bullying: true, msg: '内容涉及受保护人员姓名，无法发送' });
    const notices = readNotices();
    const notice = notices.find(n => n.id === req.params.id);
    if (!notice) return res.json({ ok: false, msg: '通知不存在' });
    if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });
    notice.title = title.trim();
    notice.content = content.trim();
    if (author && author.trim()) notice.author = author.trim();
    if (level) notice.level = level === 'T0' ? 'T0' : 'T1';
    notice.updatedAt = new Date().toISOString();
    writeNotices(notices);
    res.json({ ok: true, msg: '通知已修改' });
  });
};
