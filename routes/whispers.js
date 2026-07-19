const { verifyUserToken } = require('../lib/crypto');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked, emitUserNotice } = require('../lib/penalty');
const credibility = require('../lib/credibility');
const db = require('../db');
const { isUserPlus } = require('../lib/subscription');

const WHISPER_MAX_LENGTH = 50;

module.exports = function(app) {

  app.post('/api/whispers', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const { receiverId, content } = req.body;
    if (!receiverId || !content) return res.json({ ok: false, msg: '接收者和内容不能为空' });
    if (content.length > WHISPER_MAX_LENGTH) return res.json({ ok: false, msg: '内容不能超过' + WHISPER_MAX_LENGTH + '字' });
    if (receiverId === session.id) return res.json({ ok: false, msg: '不能给自己发悄悄话' });

    if (credibility.isFeatureBlocked(session.id, 'whisper')) {
      return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
    }

    if (isFeatureBlocked(session.id, 'whisper')) {
      return res.json({ ok: false, msg: '当前账号功能受限，无法发送悄悄话', code: 'FEATURE_BLOCKED' });
    }

    // 悄悄话每周配额检测（PLUS 20次/周免费，非PLUS 2次/周免费，超出自动扣200credit）
    const _now = new Date();
    const dayOfWeek = _now.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(_now);
    monday.setDate(_now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString();
    const allWhispers = db.readWhispers();
    const sid = String(session.id);
    const weekWhispers = allWhispers.filter(w => String(w.senderId) === sid && !w.deleted && w.createdAt >= weekStart);
    const whisperLimit = isUserPlus(session.id) ? 20 : 2;
    if (weekWhispers.length >= whisperLimit) {
      const users = db.readUsers();
      const sender = users.find(u => String(u.id) === sid);
      if (!sender || (sender.credit || 0) < 200) {
        return res.json({ ok: false, msg: '本周悄悄话次数已用完（' + whisperLimit + '/' + whisperLimit + '），credit 不足 200，无法发送', code: 'INSUFFICIENT_CREDIT' });
      }
      sender.credit = (sender.credit || 0) - 200;
      db.writeUsers(users);
      const logs = db.readCreditLogs();
      logs.push({
        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: session.id,
        amount: -200,
        reason: '悄悄话超额消耗（自然周限制）',
        createdAt: new Date().toISOString()
      });
      db.writeCreditLogs(logs);
    }

    const sensitiveWords = checkSensitive(content);
    if (sensitiveWords.length > 0) {
      return res.json({ ok: false, msg: '内容包含敏感词，请修改后重试', code: 'SENSITIVE_WORDS', warningMsg: '内容包含敏感词，请修改后重试' });
    }

    const blockedNames = checkBullyingNames(content);
    if (blockedNames.length > 0) {
      return res.json({ ok: false, msg: '内容包含受保护名称，请修改后重试', code: 'BULLYING_NAME', warningMsg: '内容包含受保护名称' });
    }

    const users = db.readUsers();
    const receiver = users.find(u => u.id === receiverId && u.status !== 'banned');
    if (!receiver) return res.json({ ok: false, msg: '接收用户不存在或已被封禁' });

    const sender = users.find(u => u.id === session.id);
    if (!sender) return res.json({ ok: false, msg: '发送者不存在' });

    const whisperId = generateId('WHIS');
    const now = new Date().toISOString();
    const whisper = {
      id: whisperId,
      senderId: session.id,
      senderName: sender.nickname || sender.username,
      receiverId: receiverId,
      receiverName: receiver.nickname || receiver.username,
      content: content,
      notifLevel: 'T1',
      createdAt: now,
      deleted: 0,
      signed: 0,
      signTime: null
    };

    db.addWhisper(whisper);
    logIdAssignment('whisper', whisperId, content.substring(0, 100), db);

    emitUserNotice(receiverId, '💬 收到一条悄悄话',
      '有人给你发了一条悄悄话，快去查看吧', 'T1');

    res.json({ ok: true, data: { id: whisperId } });
  });

  app.get('/api/whispers/inbox', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const all = db.readWhispers();
    const mine = all.filter(w => w.receiverId === session.id && !w.deleted)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, data: mine });
  });

  app.post('/api/whispers/:id/sign', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const all = db.readWhispers();
    const whisper = all.find(w => w.id === req.params.id);
    if (!whisper) return res.json({ ok: false, msg: '悄悄话不存在' });
    if (whisper.receiverId !== session.id) return res.json({ ok: false, msg: '无权操作' });
    if (whisper.signed) return res.json({ ok: false, msg: '已签收' });

    whisper.signed = 1;
    whisper.signTime = new Date().toISOString();
    db.writeWhispers(all);

    emitUserNotice(whisper.senderId, '💬 悄悄话已签收',
      whisper.receiverName + ' 已签收你的悄悄话', 'T1');

    res.json({ ok: true });
  });
};
