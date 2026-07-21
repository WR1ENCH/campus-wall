// ===== routes/votes.js - 投票系统 =====
const { verifyUserToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { requireAdmin } = require('../lib/middleware');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const uniqueId = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked } = require('../lib/penalty');
const credibility = require('../lib/credibility');

function readVotes() { return db.readVotes(); }
function writeVotes(votes) { db.writeVotes(votes); broadcastSSE('voteUpdate', { t: Date.now() }); }
function readVoteRecords() { return db.readVoteRecords(); }
function writeVoteRecords(records) { db.writeVoteRecords(records); }
function readVoteIpRecords() { return db.readVoteIpRecords(); }
function writeVoteIpRecords(records) { db.writeVoteIpRecords(records); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readSC() { return db.readSC(); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); }

function _updateVoteOptions(vote, newOptions) {
  const oldOptions = vote.options || [];
  const newOpts = newOptions.map((opt, idx) => {
    const optText = typeof opt === 'string' ? opt : (opt.text || '');
    const optImage = typeof opt === 'string' ? null : (opt.image || null);
    const existing = oldOptions[idx];
    return { id: existing ? existing.id : 'opt_' + idx + '_' + Math.random().toString(36).slice(2, 6), text: optText.trim(), image: optImage, votes: existing ? existing.votes : 0 };
  });
  vote.options = newOpts;
}

// 校验请求是否来自管理员或学生会（拒绝普通用户 token 冒用提权）
function _resolveAdminOrSC(req) {
  const token = req.headers['x-admin-token'] || req.headers['x-sc-token'];
  if (!token) return null;
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) return null;
  // 管理员 token 带 role 字段，且 24 小时内有效
  if (session.role && (Date.now() - session.loginAt <= 24 * 3600 * 1000)) return session;
  // 学生会 token：匹配学生会账号，或具备通知发布权限的用户
  const sc = readSC();
  if (sc && sc.id === session.id) return session;
  const users = readUsers();
  if (users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned')) return session;
  return null;
}

module.exports = function(app) {
  app.get('/api/votes', (req, res) => {
    const votes = readVotes().filter(v => !v.deleted);
    // ponytail: 返回当前登录用户在此投票中已选的 optionId 列表，
    // 前端据此置 hasVoted=true → 隐藏“确认投票”按钮、高亮已选项。旧接口未返回 → 按钮永驻。
    const token = req.headers['x-user-token'];
    let userId = null;
    if (token) { const s = verifyUserToken(token); if (s) userId = s.id; }
    let data = votes;
    if (userId) {
      const myRecords = readVoteRecords().filter(r => r.userId === userId);
      data = votes.map(v => ({
        ...v,
        userVoted: myRecords.filter(r => r.voteId === v.id).map(r => r.optionId).filter(Boolean)
      }));
    }
    res.json({ ok: true, data });
  });
  app.post('/api/votes', requireAdmin, (req, res) => {
    const { title, options, multiple, allowCustom, endTime } = req.body;
    if (!title || !options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '请填写完整信息' });
    const votes = readVotes();
    votes.push({ id: uniqueId.generateId('VOTE'), userId: req.admin.id, author: req.admin.name, avatar: '', title: title.trim(), options: options.map((o, i) => ({ id: 'opt_' + i + '_' + Math.random().toString(36).slice(2, 6), text: typeof o === 'string' ? o.trim() : (o.text || '').trim(), image: typeof o === 'string' ? null : (o.image || null), votes: 0 })), multiple: !!multiple, allowCustom: !!allowCustom, endTime: endTime || null, createdAt: new Date().toISOString(), deleted: false });
    writeVotes(votes);
    res.json({ ok: true });
  });
  app.post('/api/notice/votes', (req, res) => {
    const session = _resolveAdminOrSC(req);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const { title, options, multiple, allowCustom, endTime } = req.body;
    if (!title || !options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '请填写完整信息' });
    const votes = readVotes();
    votes.push({ id: uniqueId.generateId('VOTE'), userId: session.id, author: '', avatar: '', title: title.trim(), options: options.map((o, i) => ({ id: 'opt_' + i + '_' + Math.random().toString(36).slice(2, 6), text: typeof o === 'string' ? o.trim() : (o.text || '').trim(), image: typeof o === 'string' ? null : (o.image || null), votes: 0 })), multiple: !!multiple, allowCustom: !!allowCustom, endTime: endTime || null, createdAt: new Date().toISOString(), deleted: false });
    writeVotes(votes);
    res.json({ ok: true });
  });
  app.post('/api/admin/votes', requireAdmin, (req, res) => {
    const { title, options, multiple, allowCustom, endTime } = req.body;
    if (!title || !options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '请填写完整信息' });
    const votes = readVotes();
    votes.push({ id: uniqueId.generateId('VOTE'), userId: req.admin.id, author: req.admin.name, avatar: '', title: title.trim(), options: options.map((o, i) => ({ id: 'opt_' + i + '_' + Math.random().toString(36).slice(2, 6), text: typeof o === 'string' ? o.trim() : (o.text || '').trim(), image: typeof o === 'string' ? null : (o.image || null), votes: 0 })), multiple: !!multiple, allowCustom: !!allowCustom, endTime: endTime || null, createdAt: new Date().toISOString(), deleted: false });
    writeVotes(votes);
    res.json({ ok: true });
  });
  app.post('/api/votes/:id/vote', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
    // 信用分检测
    if (credibility.isFeatureBlocked(session.id, 'vote')) {
      return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
    }

    // 处罚限制检测
    if (isFeatureBlocked(session.id, 'vote')) {
      return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
    }
    // ponytail: 前端 submitVoteSelection 发送 { optionIds:[...], customOption? }，
    // 旧代码读 { optionId, customText } 字段名不匹配 → 选项票数不增、自定义选项不创建，
    // 但 vote_record 已写入 → 再投即报“你已经投过票了”。此处对齐字段名并支持多选。
    const { optionIds, customOption } = req.body;
    const ids = Array.isArray(optionIds) ? optionIds.filter(Boolean) : [];
    const customText = typeof customOption === 'string' ? customOption.trim() : '';

    const votes = readVotes();
    const vote = votes.find(v => v.id === req.params.id);
    if (!vote) return res.json({ ok: false, msg: '投票不存在' });
    if (vote.deleted) return res.json({ ok: false, msg: '投票已删除' });
    const records = readVoteRecords();
    if (records.find(r => r.voteId === vote.id && r.userId === session.id)) return res.json({ ok: false, msg: '你已经投过票了' });

    // 自定义选项：新建并入栈，记录指向其 id，使 GET 返回的 userVoted 可高亮
    let customOptId = null;
    if (vote.allowCustom && customText) {
      customOptId = 'opt_custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      vote.options.push({ id: customOptId, text: customText, votes: 1 });
    }
    // 多选逐项计票；单选时 ids 仅 1 项
    ids.forEach(id => {
      const opt = vote.options.find(o => o.id === id);
      if (opt) opt.votes = (opt.votes || 0) + 1;
    });

    const recordedIds = ids.slice();
    if (customOptId) recordedIds.push(customOptId);
    if (recordedIds.length === 0) return res.json({ ok: false, msg: '请选择投票选项' });

    const now = new Date().toISOString();
    recordedIds.forEach(id => {
      records.push({ id: 'vr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), voteId: vote.id, optionId: id, userId: session.id, createdAt: now });
    });
    writeVoteRecords(records);
    writeVotes(votes);
    res.json({ ok: true });
  });
  app.put('/api/votes/:id', (req, res) => {
    const session = _resolveAdminOrSC(req);
    if (!session) return res.json({ ok: false, msg: '登录已过期或无权限' });
    const { title, options, multiple, allowCustom, endTime } = req.body;
    const votes = readVotes();
    const vote = votes.find(v => v.id === req.params.id);
    if (!vote) return res.json({ ok: false, msg: '投票不存在' });
    if (title) vote.title = title.trim();
    if (options) _updateVoteOptions(vote, options);
    if (multiple !== undefined) vote.multiple = !!multiple;
    if (allowCustom !== undefined) vote.allowCustom = !!allowCustom;
    if (endTime !== undefined) vote.endTime = endTime || null;
    writeVotes(votes);
    res.json({ ok: true });
  });
  app.delete('/api/votes/:id', requireAdmin, (req, res) => {
    const votes = readVotes();
    const vote = votes.find(v => v.id === req.params.id);
    if (!vote) return res.json({ ok: false, msg: '投票不存在' });
    vote.deleted = true;
    writeVotes(votes);
    res.json({ ok: true });
  });

  // 管理端投票列表（aeed436 路由拆分时遗漏，admin.html loadAdminVotes 调用）
  app.get('/api/admin/votes', requireAdmin, (req, res) => {
    const votes = readVotes();
    const records = readVoteRecords();
    const list = votes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({
      ok: true,
      data: list.map(v => ({
        ...v,
        totalVotes: v.options.reduce((s, o) => s + (o.votes || 0), 0),
        participantCount: [...new Set(records.filter(r => r.voteId === v.id).map(r => r.userId))].length,
        allowCustom: v.allowCustom === true || v.allowCustom === 1 || v.allowCustom === '1' || v.allowCustom === 'true'
      }))
    });
  });

  // 截止投票（管理员/学生会）—— aeed436 遗漏，admin.html adminEndVote 调用
  app.post('/api/votes/:id/end', (req, res) => {
    const session = _resolveAdminOrSC(req);
    if (!session) return res.json({ ok: false, msg: '登录无效或无权限' });

    const votes = readVotes();
    const vote = votes.find(v => v.id === req.params.id && !v.deleted);
    if (!vote) return res.json({ ok: false, msg: '投票不存在' });
    if (vote.endTime && new Date(vote.endTime) < new Date()) return res.json({ ok: false, msg: '投票已结束' });

    vote.endTime = new Date().toISOString();
    writeVotes(votes);
    res.json({ ok: true, msg: '投票已截止' });
  });
};
