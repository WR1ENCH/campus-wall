// ===== routes/subscription.js - PLUS++ 订阅系统 =====
const { verifyUserToken } = require('../lib/crypto');
const { broadcastSSE } = require('../lib/sse');
const { redeemRateLimit } = require('../lib/state');
const db = require('../db');
const crypto = require('crypto');
const { generateId } = require('../lib/uniqueId');

const CARD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_MOD = CARD_CHARS.length;

const PRICES = {
  weekly: 30,
  monthly: 100
};

function readSubscriptions() { return db.readSubscriptions(); }
function writeSubscriptions(data) { db.writeSubscriptions(data); broadcastSSE('subscriptionUpdate', { t: Date.now() }); }

function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readPlusCards() { return db.readPlusCards(); }
function writePlusCards(cards) { db.writePlusCards(cards); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }

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
  return CARD_CHARS[expected] === code[code.length - 1];
}

function generatePlusCardCode(existingCards) {
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
    code = 'PLUS-' + rawCode.slice(0, 4) + '-' + rawCode.slice(4, 8) + '-' + rawCode.slice(8, 12);
    attempts++;
    if (attempts > 100) break;
  } while (codeSet.has(code));
  return code;
}

function getUserActiveSubscription(userId) {
  const subs = readSubscriptions();
  const now = new Date().toISOString();
  return subs.find(s => s.userId === userId && s.status === 'active' && s.endTime > now);
}

function activateSubscription(userId, plan, paymentMethod, cardCode, renewedFromId) {
  const now = new Date();
  const durationMs = plan === 'weekly' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const startTime = now.toISOString();
  const endTime = new Date(now.getTime() + durationMs).toISOString();
  const price = PRICES[plan];

  const sub = {
    id: generateId('SUBS'),
    userId,
    plan,
    startTime,
    endTime,
    price,
    paymentMethod,
    cardCode: cardCode || null,
    status: 'active',
    renewedFrom: renewedFromId || null,
    createdAt: startTime
  };

  db.addSubscription(sub);
  return sub;
}

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
  db.addUserNotification({
    notificationId,
    userId: targetUserId,
    read: 0,
    createdAt: new Date().toISOString()
  });
}

module.exports = function(app) {

  // 获取当前用户订阅状态
  app.get('/api/user/subscription', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const sub = getUserActiveSubscription(session.id);
    if (!sub) {
      return res.json({ ok: true, data: null, prices: PRICES });
    }

    const now = new Date();
    const endTime = new Date(sub.endTime);
    const daysLeft = Math.max(0, Math.ceil((endTime - now) / (24 * 3600 * 1000)));

    res.json({
      ok: true,
      data: {
        ...sub,
        daysLeft,
        isPlus: true
      },
      prices: PRICES
    });
  });

  // 查询当前价格（含折扣）
  app.get('/api/user/subscription/price', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const subs = readSubscriptions();
    const userSubs = subs.filter(s => s.userId === session.id && s.status === 'active');
    const hasHistory = userSubs.length > 0;

    const discountRate = hasHistory ? 0.9 : 1;
    res.json({
      ok: true,
      data: {
        weekly: Math.round(PRICES.weekly * discountRate),
        monthly: Math.round(PRICES.monthly * discountRate),
        weeklyOriginal: PRICES.weekly,
        monthlyOriginal: PRICES.monthly,
        discount: hasHistory ? '9折' : null
      }
    });
  });

  // 创建订阅（Credit 支付或卡密兑换）
  app.post('/api/user/subscriptions', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const now = Date.now();
    const rlKey = 'sub_' + session.id;
    let rl = redeemRateLimit.get(rlKey);
    if (!rl || now - rl.window > 60000) {
      rl = { window: now, count: 0 };
      redeemRateLimit.set(rlKey, rl);
    }
    rl.count++;
    if (rl.count > 5) return res.json({ ok: false, msg: '操作太频繁，请稍后再试' });

    const { plan, payment, cardCode } = req.body;
    if (!['weekly', 'monthly'].includes(plan)) {
      return res.json({ ok: false, msg: '请选择周卡或月卡' });
    }
    if (!['credit', 'card'].includes(payment)) {
      return res.json({ ok: false, msg: '请选择支付方式' });
    }

    if (payment === 'card') {
      if (!cardCode || !cardCode.trim()) {
        return res.json({ ok: false, msg: '请输入卡密' });
      }
      const cleanCode = cardCode.trim().toUpperCase();
      if (!/^PLUS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) {
        return res.json({ ok: false, msg: '卡密格式不正确' });
      }
      const codePart = cleanCode.replace(/-/g, '').slice(3);
      if (!luhnModN(codePart)) {
        return res.json({ ok: false, msg: '卡密无效（校验码不匹配）' });
      }

      const cards = readPlusCards();
      const card = cards.find(c => c.code === cleanCode);
      if (!card) return res.json({ ok: false, msg: '卡密不存在' });
      if (card.status !== 'unused') return res.json({ ok: false, msg: '该卡密已被使用' });

      const cardPlan = card.plan;
      const existing = getUserActiveSubscription(session.id);

      card.status = 'used';
      card.usedBy = session.id;
      card.usedAt = new Date().toISOString();
      writePlusCards(cards);

      const sub = activateSubscription(session.id, cardPlan, 'card', cleanCode, existing?.id);
      pushUserNotice(session.id, 'PLUS++ 订阅已激活', `恭喜！你已通过卡密兑换激活 PLUS++ ${cardPlan === 'weekly' ? '周卡' : '月卡'}，有效期至 ${new Date(sub.endTime).toLocaleDateString('zh-CN')}`, 'T1');

      console.warn('[AUDIT] 用户 ' + session.id + ' 通过卡密兑换 PLUS++ ' + cardPlan + ' 订阅');

      return res.json({
        ok: true,
        msg: '订阅成功！PLUS++ 权益已激活',
        data: sub
      });
    }

    const subs = readSubscriptions();
    const userSubs = subs.filter(s => s.userId === session.id);
    const hasHistory = userSubs.length > 0;
    const discountRate = hasHistory ? 0.9 : 1;
    const price = Math.round(PRICES[plan] * discountRate);

    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === session.id);
    if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

    const user = users[userIndex];
    if ((user.credit || 0) < price) {
      return res.json({ ok: false, msg: `Credit 不足，还需 ${price - (user.credit || 0)} Credit`, data: { required: price, balance: user.credit || 0 } });
    }

    users[userIndex].credit = (users[userIndex].credit || 0) - price;
    writeUsers(users);

    const creditLogs = db.readCreditLogs();
    creditLogs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id,
      amount: -price,
      reason: 'PLUS++ 订阅购买（' + (plan === 'weekly' ? '周卡' : '月卡') + '）',
      createdAt: new Date().toISOString()
    });
    db.writeCreditLogs(creditLogs);

    const existing = getUserActiveSubscription(session.id);
    let sub;
    if (existing) {
      const oldEndTime = new Date(existing.endTime);
      const durationMs = plan === 'weekly' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
      const newEndTime = new Date(Math.max(oldEndTime.getTime(), Date.now()) + durationMs);
      db.updateSubscription(existing.id, { endTime: newEndTime.toISOString() });
      sub = { ...existing, endTime: newEndTime.toISOString() };
    } else {
      sub = activateSubscription(session.id, plan, 'credit', null, null);
    }

    pushUserNotice(session.id, 'PLUS++ 订阅成功', `你已成功订阅 PLUS++ ${plan === 'weekly' ? '周卡' : '月卡'}，有效期至 ${new Date(sub.endTime).toLocaleDateString('zh-CN')}`, 'T1');

    console.warn('[AUDIT] 用户 ' + session.id + ' 花费 ' + price + ' Credit 购买 PLUS++ ' + plan + ' 订阅');

    res.json({
      ok: true,
      msg: '订阅成功！PLUS++ 权益已激活',
      data: sub
    });
  });

  // 续订（手动续订，用 Credit）
  app.post('/api/user/subscriptions/renew', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const { plan } = req.body;
    if (!['weekly', 'monthly'].includes(plan)) {
      return res.json({ ok: false, msg: '请选择周卡或月卡' });
    }

    const subs = readSubscriptions();
    const userSubs = subs.filter(s => s.userId === session.id);
    const hasHistory = userSubs.length > 0;
    const discountRate = hasHistory ? 0.85 : 1;
    const price = Math.round(PRICES[plan] * discountRate);

    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === session.id);
    if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

    const user = users[userIndex];
    if ((user.credit || 0) < price) {
      return res.json({ ok: false, msg: `Credit 不足，还需 ${price - (user.credit || 0)} Credit`, data: { required: price, balance: user.credit || 0 } });
    }

    users[userIndex].credit = (users[userIndex].credit || 0) - price;
    writeUsers(users);

    const existing = getUserActiveSubscription(session.id);
    const oldSubId = existing?.id;

    const creditLogs = db.readCreditLogs();
    creditLogs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id,
      amount: -price,
      reason: 'PLUS++ 续订（' + (plan === 'weekly' ? '周卡' : '月卡') + '）',
      createdAt: new Date().toISOString()
    });
    db.writeCreditLogs(creditLogs);

    const sub = activateSubscription(session.id, plan, 'credit', null, oldSubId);

    if (existing) {
      db.updateSubscription(existing.id, { status: 'expired' });
    }

    pushUserNotice(session.id, 'PLUS++ 续订成功', `你已成功续订 PLUS++ ${plan === 'weekly' ? '周卡' : '月卡'}，有效期至 ${new Date(sub.endTime).toLocaleDateString('zh-CN')}`, 'T1');

    console.warn('[AUDIT] 用户 ' + session.id + ' 花费 ' + price + ' Credit 续订 PLUS++ ' + plan);

    res.json({
      ok: true,
      msg: '续订成功！',
      data: sub
    });
  });

  // 检查即将到期的订阅并触发通知
  app.post('/api/user/subscriptions/check-expiry', (req, res) => {
    const subs = readSubscriptions();
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 3600 * 1000);
    let notified = 0;

    for (const sub of subs) {
      if (sub.status !== 'active') continue;
      const endTime = new Date(sub.endTime);
      if (endTime <= soon && endTime > now) {
        const hours = Math.ceil((endTime - now) / (3600 * 1000));
        pushUserNotice(sub.userId, 'PLUS++ 即将到期', `你的 PLUS++ 订阅将在 ${hours} 小时后到期，请及时续订以保持权益`, 'T2');
        notified++;
      }
      if (endTime <= now) {
        db.updateSubscription(sub.id, { status: 'expired' });
      }
    }

    res.json({ ok: true, data: { notified, expired: subs.filter(s => s.status === 'active' && new Date(s.endTime) <= now).length } });
  });

  // 检查用户是否为 PLUS++ 会员（公开 API，供其他路由调用）
  app.get('/api/user/subscription/status', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: true, data: { isPlus: false } });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: true, data: { isPlus: false } });

    const sub = getUserActiveSubscription(session.id);
    res.json({ ok: true, data: { isPlus: !!sub, subscription: sub } });
  });

};