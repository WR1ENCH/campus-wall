const db = require('../db');
const { generateId } = require('./uniqueId');

const THRESHOLDS = {
  whisper: 90,
  anonymous_post: 85,
  qa: 80,
  post: 60,
  vote: 50,
};

const CREDIBILITY_MAX_EXCHANGE = 15;
const REFRESH_MONTHS = [1, 3, 6, 9];

function getExchangeRate(totalExchanged) {
  if (totalExchanged <= 5) return 300;
  if (totalExchanged <= 10) return 700;
  if (totalExchanged <= CREDIBILITY_MAX_EXCHANGE) return 1000;
  return Infinity;
}

function getScore(userId) {
  const users = db.readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  return {
    score: user.credibility_score != null ? user.credibility_score : 90,
    exchangedTotal: user.credibility_exchanged_total || 0,
    lastRefresh: user.credibility_last_refresh || null,
    credit: user.credit || 0,
  };
}

function isFeatureBlocked(userId, feature) {
  const info = getScore(userId);
  if (!info) return true;
  const threshold = THRESHOLDS[feature];
  if (threshold === undefined) return false;
  return info.score < threshold;
}

function checkAndRefresh(user) {
  const now = new Date();
  const lastRefresh = user.credibility_last_refresh ? new Date(user.credibility_last_refresh) : null;
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  let needRefresh = false;
  if (!lastRefresh) {
    needRefresh = true;
  } else {
    const lastMonth = lastRefresh.getMonth() + 1;
    const lastYear = lastRefresh.getFullYear();
    if (currentYear > lastYear) {
      needRefresh = true;
    } else if (currentYear === lastYear) {
      for (const m of REFRESH_MONTHS) {
        if (currentMonth >= m && lastMonth < m) {
          needRefresh = true;
          break;
        }
        if (currentMonth === m && lastMonth < m) {
          needRefresh = true;
          break;
        }
      }
    }
  }
  if (needRefresh) {
    user.credibility_exchanged_total = 0;
    user.credibility_last_refresh = now.toISOString();
    db.writeCredibilityLogs([
      ...db.readCredibilityLogs(),
      {
        id: generateId('CRDL'),
        userId: user.id,
        amount: 0,
        score: user.credibility_score || 90,
        reason: '季度刷新：兑换量已重置',
        type: 'refresh',
        createdAt: now.toISOString(),
      },
    ]);
  }
  return user;
}

function exchangeCredits(userId, creditsToSpend) {
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { ok: false, msg: '用户不存在' };
  const user = users[idx];
  checkAndRefresh(user);
  const currentScore = user.credibility_score != null ? user.credibility_score : 90;
  const exchangedTotal = user.credibility_exchanged_total || 0;
  const rate = getExchangeRate(exchangedTotal);
  if (!isFinite(rate) || exchangedTotal >= CREDIBILITY_MAX_EXCHANGE) {
    return { ok: false, msg: '已达到本季度兑换上限（15分）' };
  }
  if (creditsToSpend < rate) {
    return { ok: false, msg: `当前兑换汇率 ${rate} credits = 1 信用分，credits 不足` };
  }
  if ((user.credit || 0) < creditsToSpend) {
    return { ok: false, msg: 'credits 余额不足' };
  }
  const maxScoreCanBuy = CREDIBILITY_MAX_EXCHANGE - exchangedTotal;
  const scoreToAdd = Math.min(Math.floor(creditsToSpend / rate), maxScoreCanBuy);
  if (scoreToAdd <= 0) {
    return { ok: false, msg: `credits 不足以兑换 1 信用分（当前汇率 ${rate}/分）` };
  }
  const actualCost = scoreToAdd * rate;
  const newScore = currentScore + scoreToAdd;
  const newExchangedTotal = exchangedTotal + scoreToAdd;
  user.credit = (user.credit || 0) - actualCost;
  user.credibility_score = newScore;
  user.credibility_exchanged_total = newExchangedTotal;
  db.writeUsers(users);
  const log = {
    id: generateId('CRDL'),
    userId: userId,
    amount: scoreToAdd,
    score: newScore,
    reason: `用 ${actualCost} credits 兑换 ${scoreToAdd} 信用分`,
    type: 'exchange',
    createdAt: new Date().toISOString(),
  };
  db.insertCredibilityLog(log);
  return { ok: true, data: { score: newScore, exchangedTotal: newExchangedTotal, cost: actualCost, gained: scoreToAdd } };
}

function deductCredibility(userId, amount, reason) {
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { ok: false, msg: '用户不存在' };
  const user = users[idx];
  const currentScore = user.credibility_score != null ? user.credibility_score : 90;
  const newScore = Math.max(0, currentScore - amount);
  user.credibility_score = newScore;
  db.writeUsers(users);
  const log = {
    id: generateId('CRDL'),
    userId: userId,
    amount: -amount,
    score: newScore,
    reason: reason,
    type: 'deduction',
    createdAt: new Date().toISOString(),
  };
  db.insertCredibilityLog(log);
  return { ok: true, data: { score: newScore, deducted: amount } };
}

function restoreCredibility(userId, amount, reason) {
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { ok: false, msg: '用户不存在' };
  const user = users[idx];
  const currentScore = user.credibility_score != null ? user.credibility_score : 90;
  const newScore = currentScore + amount;
  user.credibility_score = newScore;
  db.writeUsers(users);
  const log = {
    id: generateId('CRDL'),
    userId: userId,
    amount: amount,
    score: newScore,
    reason: reason,
    type: 'restore',
    createdAt: new Date().toISOString(),
  };
  db.insertCredibilityLog(log);
  return { ok: true, data: { score: newScore, restored: amount } };
}

function initUserCredibility(user) {
  if (user.credibility_score == null) {
    user.credibility_score = 90;
  }
  if (user.credibility_exchanged_total == null) {
    user.credibility_exchanged_total = 0;
  }
  if (user.credibility_last_refresh == null) {
    checkAndRefresh(user);
  }
  return user;
}

function addZhixueBonus(userId) {
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { ok: false, msg: '用户不存在' };
  const user = users[idx];
  user.credibility_score = (user.credibility_score != null ? user.credibility_score : 90) + 10;
  db.writeUsers(users);
  const log = {
    id: generateId('CRDL'),
    userId: userId,
    amount: 10,
    score: user.credibility_score,
    reason: '同学验证通过，信用分 +10',
    type: 'bonus',
    createdAt: new Date().toISOString(),
  };
  db.insertCredibilityLog(log);
  return { ok: true, data: { score: user.credibility_score } };
}

module.exports = {
  THRESHOLDS,
  CREDIBILITY_MAX_EXCHANGE,
  REFRESH_MONTHS,
  getExchangeRate,
  getScore,
  isFeatureBlocked,
  checkAndRefresh,
  exchangeCredits,
  deductCredibility,
  restoreCredibility,
  initUserCredibility,
  addZhixueBonus,
};
