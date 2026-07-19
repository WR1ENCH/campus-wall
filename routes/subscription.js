// ===== routes/subscription.js - PLUS++ 订阅系统 =====
const { verifyUserToken } = require('../lib/crypto');
const { broadcastSSE } = require('../lib/sse');
const { redeemRateLimit } = require('../lib/state');
const db = require('../db');
const { generateId } = require('../lib/uniqueId');
const { luhnModN, generatePlusCardCode, pushUserNotice } = require('../lib/subscription');

const PRICES = {
  weekly: 300,
  monthly: 1000
};

function readSubscriptions() { return db.readSubscriptions(); }
function writeSubscriptions(data) { db.writeSubscriptions(data); broadcastSSE('subscriptionUpdate', { t: Date.now() }); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readPlusCards() { return db.readPlusCards(); }
function writePlusCards(cards) { db.writePlusCards(cards); }

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

module.exports = function(app) {

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

    res.json({ ok: true, data: { ...sub, daysLeft, isPlus: true }, prices: PRICES });
  });

  app.get('/api/user/subscription/price', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const subs = readSubscriptions();
    const hasHistory = subs.some(s => s.userId === session.id && s.status === 'active');
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
    if (!['weekly', 'monthly'].includes(plan)) return res.json({ ok: false, msg: '请选择周卡或月卡' });
    if (!['credit', 'card'].includes(payment)) return res.json({ ok: false, msg: '请选择支付方式' });

    if (payment === 'card') {
      if (!cardCode || !cardCode.trim()) return res.json({ ok: false, msg: '请输入卡密' });
      const cleanCode = cardCode.trim().toUpperCase();
      if (!/^PLUS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) return res.json({ ok: false, msg: '卡密格式不正确' });
      const codePart = cleanCode.replace(/-/g, '').slice(3);
      if (!luhnModN(codePart)) return res.json({ ok: false, msg: '卡密无效（校验码不匹配）' });

      try {
        const result = db.getDb().transaction(() => {
          const cards = db.readPlusCards();
          const card = cards.find(c => c.code === cleanCode);
          if (!card) return { error: '卡密不存在' };
          if (card.status !== 'unused') return { error: '该卡密已被使用' };

          card.status = 'used';
          card.usedBy = session.id;
          card.usedAt = new Date().toISOString();
          db.writePlusCards(cards);

          const cardPlan = card.plan;
          const existing = getUserActiveSubscription(session.id);
          const sub = activateSubscription(session.id, cardPlan, 'card', cleanCode, existing?.id);
          return { sub, cardPlan };
        })();

        if (result.error) return res.json({ ok: false, msg: result.error });

        pushUserNotice(session.id, 'PLUS++ 订阅已激活', `恭喜！你已通过卡密兑换激活 PLUS++ ${result.cardPlan === 'weekly' ? '周卡' : '月卡'}，有效期至 ${new Date(result.sub.endTime).toLocaleDateString('zh-CN')}`, 'T1');
        console.warn('[AUDIT] 用户 ' + session.id + ' 通过卡密兑换 PLUS++ ' + result.cardPlan + ' 订阅');
        return res.json({ ok: true, msg: '订阅成功！PLUS++ 权益已激活', data: result.sub });
      } catch (e) {
        console.error('[subscription] card redeem tx failed:', e.message);
        return res.json({ ok: false, msg: '操作失败，请稍后重试' });
      }
    }

    const subs = readSubscriptions();
    const hasHistory = subs.some(s => s.userId === session.id);
    const discountRate = hasHistory ? 0.9 : 1;
    const price = Math.round(PRICES[plan] * discountRate);

    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === session.id);
    if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
    if ((users[userIndex].credit || 0) < price) {
      return res.json({ ok: false, msg: `Credit 不足，还需 ${price - (users[userIndex].credit || 0)} Credit`, data: { required: price, balance: users[userIndex].credit || 0 } });
    }

    users[userIndex].credit -= price;
    writeUsers(users);

    const creditLogs = db.readCreditLogs();
    creditLogs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id, amount: -price,
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
    console.warn('[AUDIT] 用户 ' + session.id + ' 花费 ' + price + ' Credit 购买 PLUS++ ' + plan);
    res.json({ ok: true, msg: '订阅成功！PLUS++ 权益已激活', data: sub });
  });

  app.post('/api/user/subscriptions/renew', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const { plan } = req.body;
    if (!['weekly', 'monthly'].includes(plan)) return res.json({ ok: false, msg: '请选择周卡或月卡' });

    const subs = readSubscriptions();
    const hasHistory = subs.some(s => s.userId === session.id);
    const discountRate = hasHistory ? 0.85 : 1;
    const price = Math.round(PRICES[plan] * discountRate);

    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === session.id);
    if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
    if ((users[userIndex].credit || 0) < price) {
      return res.json({ ok: false, msg: `Credit 不足，还需 ${price - (users[userIndex].credit || 0)} Credit`, data: { required: price, balance: users[userIndex].credit || 0 } });
    }

    users[userIndex].credit -= price;
    writeUsers(users);

    const existing = getUserActiveSubscription(session.id);
    const oldSubId = existing?.id;

    const creditLogs = db.readCreditLogs();
    creditLogs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id, amount: -price,
      reason: 'PLUS++ 续订（' + (plan === 'weekly' ? '周卡' : '月卡') + '）',
      createdAt: new Date().toISOString()
    });
    db.writeCreditLogs(creditLogs);

    const sub = activateSubscription(session.id, plan, 'credit', null, oldSubId);
    if (existing) db.updateSubscription(existing.id, { status: 'expired' });

    pushUserNotice(session.id, 'PLUS++ 续订成功', `你已成功续订 PLUS++ ${plan === 'weekly' ? '周卡' : '月卡'}，有效期至 ${new Date(sub.endTime).toLocaleDateString('zh-CN')}`, 'T1');
    console.warn('[AUDIT] 用户 ' + session.id + ' 花费 ' + price + ' Credit 续订 PLUS++ ' + plan);
    res.json({ ok: true, msg: '续订成功！', data: sub });
  });

  app.post('/api/user/subscriptions/check-expiry', (req, res) => {
    const subs = readSubscriptions();
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 3600 * 1000);
    let notified = 0;
    const recentlyNotified = new Set();

    for (const sub of subs) {
      if (sub.status !== 'active') continue;
      const endTime = new Date(sub.endTime);
      const notifKey = sub.userId + '|' + sub.id;
      if (endTime <= soon && endTime > now && !recentlyNotified.has(notifKey)) {
        const hours = Math.ceil((endTime - now) / (3600 * 1000));
        pushUserNotice(sub.userId, 'PLUS++ 即将到期', `你的 PLUS++ 订阅将在 ${hours} 小时后到期，请及时续订以保持权益`, 'T2');
        recentlyNotified.add(notifKey);
        notified++;
      }
      if (endTime <= now) {
        db.updateSubscription(sub.id, { status: 'expired' });
      }
    }

    res.json({ ok: true, data: { notified, expired: subs.filter(s => s.status === 'active' && new Date(s.endTime) <= now).length } });
  });

  app.get('/api/user/subscription/status', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: true, data: { isPlus: false } });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: true, data: { isPlus: false } });
    const sub = getUserActiveSubscription(session.id);
    res.json({ ok: true, data: { isPlus: !!sub, subscription: sub } });
  });

};
