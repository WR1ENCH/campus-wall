const { verifyUserToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const uniqueId = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked } = require('../lib/penalty');
const credibility = require('../lib/credibility');

function readQAQuestions() { return db.readQAQuestions(); }
function writeQAQuestions(data) { db.writeQAQuestions(data); broadcastSSE('qaUpdate', { t: Date.now() }); }
function readQAAnswers() { return db.readQAAnswers(); }
function writeQAAnswers(data) { db.writeQAAnswers(data); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readCreditLogs() { return db.readCreditLogs(); }
function writeCreditLogs(logs) { db.writeCreditLogs(logs); }

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

function settleExpiredQuestions() {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const now = new Date();
  let changed = false;
  for (const q of questions) {
    if (q.status !== 'open') continue;
    if (!q.deadline) continue;
    if (new Date(q.deadline) > now) continue;
    q.status = 'expired';
    changed = true;
    const qAnswers = answers.filter(a => a.questionId === q.id && !a.deleted);
    const totalLikes = qAnswers.reduce((s, a) => s + (a.likes || 0), 0);
    const bounty = q.bounty || 0;
    if (bounty > 0 && qAnswers.length > 0) {
      if (totalLikes === 0) {
        const share = Math.floor(bounty / qAnswers.length);
        for (const a of qAnswers) {
          if (share > 0) changeCredit(a.userId, share, '问题「' + q.title.slice(0, 10) + '...」赞数均分悬赏');
        }
      } else {
        let distributed = 0;
        for (const a of qAnswers) {
          const share = Math.floor(bounty * (a.likes || 0) / totalLikes);
          if (share > 0) {
            changeCredit(a.userId, share, '问题「' + q.title.slice(0, 10) + '...」赞数分配悬赏');
            distributed += share;
          }
        }
        const remainder = bounty - distributed;
        if (remainder > 0) {
          const top = qAnswers.sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
          changeCredit(top.userId, remainder, '问题悬赏余数奖励');
        }
      }
    }
  }
  if (changed) writeQAQuestions(questions);
}

module.exports = function(app) {

app.get('/api/qa/questions', (req, res) => {
  settleExpiredQuestions();
  const questions = readQAQuestions().filter(q => !q.deleted);
  const answers = readQAAnswers();
  const { status, page = 1, limit = 10 } = req.query;
  let list = questions;
  if (status) list = list.filter(q => q.status === status);
  list.sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  const total = list.length;
  const paged = list.slice((page - 1) * limit, page * limit);
  const result = paged.map(q => ({
    ...q,
    answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length
  }));
  res.json({ ok: true, data: result, total, page: Number(page), limit: Number(limit) });
});

app.get('/api/qa/quota', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const questions = readQAQuestions();
  const thisWeekCount = questions.filter(q =>
    q.userId === session.id && !q.deleted &&
    new Date(q.createdAt).getTime() >= monday.getTime()
  ).length;
  const FREE_QUOTA = 3;
  const EXTRA_COST = 100;
  res.json({ ok: true, data: { thisWeekCount, freeQuota: FREE_QUOTA, remaining: Math.max(0, FREE_QUOTA - thisWeekCount), extraCost: EXTRA_COST, pinCost: 149 } });
});

app.post('/api/qa/questions', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  // 信用分检测
  if (credibility.isFeatureBlocked(session.id, 'qa')) {
    return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
  }
  // 处罚限制检测
  if (isFeatureBlocked(session.id, 'qa')) {
    return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
  }
  const { title, content, bounty = 0, images = [], sensitiveForce = false, pinned = false } = req.body;
  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '标题至少2个字' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '标题最多100个字' });
  if ((content || '').length > 2000) return res.json({ ok: false, msg: '内容最多2000个字' });
  const b = Math.floor(Number(bounty) || 0);
  if (b < 0) return res.json({ ok: false, msg: '悬赏不能为负数' });
  if (!Number.isInteger(b)) return res.json({ ok: false, msg: '悬赏必须为整数' });
  if (images.length > 3) return res.json({ ok: false, msg: '最多上传3张图片' });

  // 敏感词检测
  const checkText = (title.trim() + ' ' + (content || '')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '内容包含敏感词，请修改后重试' });
  }
  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 计算本周免费问题额度（自然周：周一00:00～周日23:59）
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const weekStartMs = monday.getTime();
  const questions = readQAQuestions();
  const thisWeekCount = questions.filter(q =>
    q.userId === session.id && !q.deleted &&
    new Date(q.createdAt).getTime() >= weekStartMs
  ).length;
  const FREE_QUOTA = 3;
  const EXTRA_COST = 100;
  const PIN_COST = 149;
  const isPinned = pinned === true;
  const extraFee = thisWeekCount >= FREE_QUOTA ? EXTRA_COST : 0;
  const pinFee = isPinned ? PIN_COST : 0;
  const totalCost = b + extraFee + pinFee;
  if ((user.credit || 0) < totalCost) return res.json({ ok: false, msg: 'Credits不足，当前余额：' + (user.credit || 0) });

  // 扣除费用（悬赏 + 超额费 + 置顶费）
  if (totalCost > 0) {
    user.credit = (user.credit || 0) - totalCost;
    writeUsers(users);
    const logs = readCreditLogs();
    if (b > 0) {
      logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: session.id, amount: -b, reason: '发布问题悬赏：' + title.slice(0, 20), createdAt: new Date().toISOString() });
    }
    if (extraFee > 0) {
      logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: session.id, amount: -extraFee, reason: '本周超额提问费（第' + (thisWeekCount + 1) + '题）', createdAt: new Date().toISOString() });
    }
    if (pinFee > 0) {
      logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: session.id, amount: -pinFee, reason: '置顶问题：' + title.slice(0, 20), createdAt: new Date().toISOString() });
    }
    writeCreditLogs(logs);
  }

  const q = {
    id: uniqueId.generateId('QAQU'),
    userId: session.id,
    author: user.nickname,
    avatar: user.avatar || '',
    title: title.trim(),
    content: (content || '').trim(),
    images,
    bounty: b,
    deadline: null,
    status: 'open', // open | accepted | expired | closed
    acceptedAnswerId: null,
    distributedCredits: 0,  // 已发放的悬赏总额
    pinned: isPinned ? 1 : 0,
    createdAt: new Date().toISOString(),
    deleted: false
  };
  questions.push(q);
  writeQAQuestions(questions);
  res.json({ ok: true, data: q });
});

app.delete('/api/qa/questions/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const questions = readQAQuestions();
  const idx = questions.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '问题不存在' });
  if (questions[idx].userId !== session.id) return res.json({ ok: false, msg: '无权删除' });
  const q = questions[idx];
  if (q.status !== 'closed' && q.bounty > 0) {
    const remain = Math.max(0, q.bounty - (q.distributedCredits || 0));
    if (remain > 0) changeCredit(session.id, remain, '删除问题退还剩余悬赏');
  }
  db.addDeletedItem({
    id: q.id, type: 'qa_question', content: q.content || q.title || '',
    author: q.author || '未知', userId: q.userId,
    deletedAt: new Date().toISOString(), deletedBy: 'user',
    extra: JSON.stringify({ time: q.createdAt, title: q.title, bounty: q.bounty || 0 })
  });
  q.deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

app.get('/api/qa/questions/:id', (req, res) => {
  settleExpiredQuestions();
  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  const answers = readQAAnswers().filter(a => a.questionId === q.id && !a.deleted);
  answers.sort((a, b) => {
    if (a.reward && !b.reward) return -1;
    if (!a.reward && b.reward) return 1;
    if (a.accepted) return -1;
    if (b.accepted) return 1;
    return (b.likes || 0) - (a.likes || 0);
  });
  const remainingBounty = Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0));
  res.json({ ok: true, data: { ...q, answers, remainingBounty } });
});

app.post('/api/qa/questions/:id/answers', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  // 信用分检测
  if (credibility.isFeatureBlocked(session.id, 'qa')) {
    return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
  }
  // 处罚限制检测
  if (isFeatureBlocked(session.id, 'qa')) {
    return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
  }
  const { content, images = [], sensitiveForce = false } = req.body;
  if (!content || content.trim().length < 2) return res.json({ ok: false, msg: '回答至少2个字' });
  if (content.length > 2000) return res.json({ ok: false, msg: '回答最多2000字' });
  if (images.length > 3) return res.json({ ok: false, msg: '最多上传3张图片' });

  // 敏感词检测
  const sensitiveWords = checkSensitive(content);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '内容包含敏感词，请修改后重试' });
  }
  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
  }

  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  if (q.status !== 'open') return res.json({ ok: false, msg: '该问题已关闭' });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 不允许自答
  if (q.userId === session.id) return res.json({ ok: false, msg: '不能回答自己的问题' });

  const answers = readQAAnswers();
  // 每人只能回答一次
  if (answers.find(a => a.questionId === q.id && a.userId === session.id && !a.deleted)) {
    return res.json({ ok: false, msg: '你已回答过此问题' });
  }
  const a = {
    id: uniqueId.generateId('QAAN'),
    questionId: q.id,
    userId: session.id,
    author: user.nickname,
    avatar: user.avatar || '',
    content: content.trim(),
    images,
    likes: 0,
    likedBy: [],
    accepted: false,
    reward: 0,  // 获得的悬赏Credits
    createdAt: new Date().toISOString(),
    deleted: false
  };
  answers.push(a);
  writeQAAnswers(answers);
  res.json({ ok: true, data: a });
});

app.delete('/api/qa/answers/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '回答不存在' });
  if (answers[idx].userId !== session.id) return res.json({ ok: false, msg: '无权删除' });
  const a = answers[idx];
  db.addDeletedItem({
    id: a.id, type: 'qa_answer', content: a.content || '',
    author: a.author || '未知', userId: a.userId,
    deletedAt: new Date().toISOString(), deletedBy: 'user',
    extra: JSON.stringify({ time: a.createdAt, questionId: a.questionId, likes: a.likes || 0 })
  });
  a.deleted = true;
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// 采纳回答并发放全部剩余悬赏
app.post('/api/qa/questions/:id/accept/:aid', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  if (q.userId !== session.id) return res.json({ ok: false, msg: '无权操作' });
  if (q.status !== 'open') return res.json({ ok: false, msg: '该问题已关闭' });

  const answers = readQAAnswers();
  const a = answers.find(x => x.id === req.params.aid && x.questionId === q.id && !x.deleted);
  if (!a) return res.json({ ok: false, msg: '回答不存在' });
  if (a.userId === session.id) return res.json({ ok: false, msg: '不能采纳自己的回答' });

  const remaining = Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0));
  if (remaining > 0) {
    changeCredit(a.userId, remaining, '问题「' + q.title.slice(0, 10) + '...」悬赏');
    a.reward = (a.reward || 0) + remaining;
    q.distributedCredits = (q.distributedCredits || 0) + remaining;
  }
  a.accepted = true;
  q.acceptedAnswerId = a.id;
  q.status = 'accepted';
  writeQAAnswers(answers);
  writeQAQuestions(questions);
  res.json({ ok: true, data: { acceptedAnswerId: a.id, rewarded: remaining } });
});

// 手动发放悬赏（自定义金额分配给多个回答）
app.post('/api/qa/questions/:id/reward', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const { rewards } = req.body; // [{ answerId, amount }]
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ ok: false, msg: '请指定发放金额' });

  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  if (q.userId !== session.id) return res.json({ ok: false, msg: '无权操作' });

  const remaining = Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0));
  const total = rewards.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (total > remaining) return res.json({ ok: false, msg: '发放总额超出剩余悬赏' });

  const answers = readQAAnswers();
  let distributed = 0;
  for (const r of rewards) {
    const a = answers.find(x => x.id === r.answerId && x.questionId === q.id && !x.deleted);
    if (!a) continue;
    const amt = Number(r.amount) || 0;
    if (amt <= 0) continue;
    changeCredit(a.userId, amt, '问题「' + q.title.slice(0, 10) + '...」悬赏');
    a.reward = (a.reward || 0) + amt;
    distributed += amt;
  }
  q.distributedCredits = (q.distributedCredits || 0) + distributed;
  writeQAAnswers(answers);
  writeQAQuestions(questions);
  res.json({ ok: true, data: { distributed } });
});

// 我的提问（admin.html/index.html loadMyQuestions 调用，aeed436 路由拆分时遗漏）
app.get('/api/qa/my-questions', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期' });
  settleExpiredQuestions();
  const questions = readQAQuestions().filter(q => !q.deleted && q.userId === session.id);
  const answers = readQAAnswers();
  questions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const result = questions.map(q => ({
    ...q,
    answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length,
    remainingBounty: Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0))
  }));
  res.json({ ok: true, data: result });
});

};
