// ===== routes/wall-messages.js - 主页留言 =====
const { verifyUserToken } = require('../lib/crypto');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked, emitUserNotice } = require('../lib/penalty');
const credibility = require('../lib/credibility');
const db = require('../db');
const { isUserPlus } = require('../lib/subscription');
const { updateTaskProgress } = require('./daily-tasks');
const { wallMessageRateLimit } = require('../lib/state');

const WALL_MSG_MAX_LENGTH = 100;
const WALL_MSG_PLUS_MAX_LENGTH = 200;
const WALL_MSG_DAILY_LIMIT = 2;
const WALL_MSG_EXTRA_COST = 59;

module.exports = function(app) {

  // POST /api/wall-messages — 发送留言
  app.post('/api/wall-messages', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const { receiverId, content } = req.body;
    if (!receiverId || !content) return res.json({ ok: false, msg: '接收者和内容不能为空' });
    if (receiverId === session.id) return res.json({ ok: false, msg: '不能给自己留言' });

    const isPlus = isUserPlus(session.id);
    const maxLen = isPlus ? WALL_MSG_PLUS_MAX_LENGTH : WALL_MSG_MAX_LENGTH;
    if (content.length > maxLen) return res.json({ ok: false, msg: '内容不能超过' + maxLen + '字' });

    // 信用分检查
    if (credibility.isFeatureBlocked(session.id, 'wall_message')) {
      return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
    }

    // 惩罚检查
    if (isFeatureBlocked(session.id, 'wall_message')) {
      return res.json({ ok: false, msg: '当前账号功能受限，无法留言', code: 'FEATURE_BLOCKED' });
    }

    // 频率限制：同目标每分钟1条
    const rlKey = 'wm_' + session.id + '_' + receiverId;
    const now = Date.now();
    const lastTime = wallMessageRateLimit.get(rlKey);
    if (lastTime && now - lastTime < 60000) {
      return res.json({ ok: false, msg: '操作太频繁，请稍后再试', code: 'RATE_LIMIT' });
    }

    // 每日配额
    const todayCount = db.getTodayWallMessageCount(session.id);
    if (!isPlus && todayCount >= WALL_MSG_DAILY_LIMIT) {
      // 超出配额，检查credit
      const users = db.readUsers();
      const sender = users.find(u => String(u.id) === String(session.id));
      if (!sender || (sender.credit || 0) < WALL_MSG_EXTRA_COST) {
        return res.json({ ok: false, msg: '今日免费次数已用完，credit不足' + WALL_MSG_EXTRA_COST + '，无法发送', code: 'WALL_MSG_QUOTA_EXCEEDED' });
      }
      sender.credit = (sender.credit || 0) - WALL_MSG_EXTRA_COST;
      db.writeUsers(users);
      const logs = db.readCreditLogs();
      logs.push({
        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: session.id,
        amount: -WALL_MSG_EXTRA_COST,
        reason: '主页留言超额消耗',
        createdAt: new Date().toISOString()
      });
      db.writeCreditLogs(logs);
    }

    // 敏感词检查
    const sensitiveWords = checkSensitive(content);
    if (sensitiveWords.length > 0) {
      return res.json({ ok: false, msg: '内容包含敏感词，请修改后重试', code: 'SENSITIVE_WORDS', warningMsg: '内容包含敏感词，请修改后重试' });
    }

    const blockedNames = checkBullyingNames(content);
    if (blockedNames.length > 0) {
      return res.json({ ok: false, msg: '内容包含受保护名称，请修改后重试', code: 'BULLYING_NAME', warningMsg: '内容包含受保护名称' });
    }

    // 接收者校验
    const users = db.readUsers();
    const receiver = users.find(u => u.id === receiverId && u.status !== 'banned');
    if (!receiver) return res.json({ ok: false, msg: '接收用户不存在或已被封禁' });

    const sender = users.find(u => String(u.id) === String(session.id));
    if (!sender) return res.json({ ok: false, msg: '发送者不存在' });

    const msgId = generateId('WLMS');
    const createdAt = new Date().toISOString();

    db.addWallMessage({
      id: msgId,
      targetUserId: receiverId,
      senderId: String(session.id),
      senderName: sender.nickname || '匿名',
      content,
      createdAt,
      read: 0
    });
    logIdAssignment('wall_message', msgId, content.substring(0, 100), db);

    wallMessageRateLimit.set(rlKey, now);

    emitUserNotice(receiverId, '💬 收到一条主页留言',
      (sender.nickname || '有人') + ' 在你的主页留了言', 'T1');

    updateTaskProgress(session.id, 'wall_message');

    res.json({ ok: true, data: { id: msgId } });
  });

  // GET /api/wall-messages — 查询某用户收到的留言
  app.get('/api/wall-messages', (req, res) => {
    const { targetUserId, page, limit } = req.query;
    if (!targetUserId) return res.json({ ok: false, msg: '缺少 targetUserId' });

    const result = db.getWallMessages(targetUserId, parseInt(page) || 1, parseInt(limit) || 20);
    res.json({ ok: true, data: result });
  });

  // GET /api/wall-messages/sent — 查询自己发出的留言
  app.get('/api/wall-messages/sent', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const { page, limit } = req.query;
    const result = db.getWallMessagesBySender(String(session.id), parseInt(page) || 1, parseInt(limit) || 20);
    res.json({ ok: true, data: result });
  });

  // GET /api/wall-messages/quota — 查询今日配额
  app.get('/api/wall-messages/quota', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const isPlus = isUserPlus(session.id);
    const used = db.getTodayWallMessageCount(String(session.id));
    const dailyLimit = isPlus ? Infinity : WALL_MSG_DAILY_LIMIT;
    const remaining = isPlus ? Infinity : Math.max(0, dailyLimit - used);

    res.json({
      ok: true,
      data: {
        dailyLimit: isPlus ? -1 : dailyLimit,
        used,
        remaining: isPlus ? -1 : remaining,
        costPerExtra: WALL_MSG_EXTRA_COST,
        maxChars: isPlus ? WALL_MSG_PLUS_MAX_LENGTH : WALL_MSG_MAX_LENGTH,
        isPlus
      }
    });
  });

  // GET /api/wall-messages/unread-count — 未读留言数
  app.get('/api/wall-messages/unread-count', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const count = db.getUnreadWallMessageCount(String(session.id));
    res.json({ ok: true, data: { count } });
  });

  // POST /api/wall-messages/mark-read — 标记已读
  app.post('/api/wall-messages/mark-read', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    db.markWallMessagesRead(String(session.id));
    res.json({ ok: true });
  });
};
