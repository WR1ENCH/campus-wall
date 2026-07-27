// ===== routes/lucky-wheel.js - 幸运转盘模块 =====
const db = require('../db');
const { getBeijingDate } = require('./checkin');

function ensureTable() {
  db.runSql(`CREATE TABLE IF NOT EXISTS "lucky_wheel_spins" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "date" TEXT,
    "reward" INTEGER DEFAULT 0,
    "rewardType" TEXT DEFAULT 'credit',
    "createdAt" TEXT
  )`);
}
ensureTable();

const SEGMENTS = [
  { label: '5积分', credit: 5, weight: 25 },
  { label: '10积分', credit: 10, weight: 20 },
  { label: '20积分', credit: 20, weight: 15 },
  { label: '30积分', credit: 30, weight: 10 },
  { label: '50积分', credit: 50, weight: 5 },
  { label: '80积分', credit: 80, weight: 3 },
  { label: '100积分', credit: 100, weight: 2 },
  { label: '再来一次', credit: 0, weight: 20, type: 'spin_again' },
];

const TOTAL_WEIGHT = SEGMENTS.reduce((s, p) => s + p.weight, 0);

function weightedRandom() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

function canSpinWheel(userId) {
  const today = getBeijingDate();
  // 检查今日任务完成情况
  const tasks = db.allSql(
    'SELECT * FROM daily_tasks WHERE userId = ? AND date = ?',
    [userId, today]
  );
  const completedCount = tasks.filter(t => t.completed).length;
  const totalNeeded = Math.min(tasks.length, 3);

  // 检查转盘次数限制
  const spins = db.allSql(
    'SELECT COUNT(*) as cnt FROM lucky_wheel_spins WHERE userId = ? AND date = ?',
    [userId, today]
  );
  const spinCount = spins[0] ? spins[0].cnt : 0;

  return {
    canSpin: completedCount >= totalNeeded && spinCount < 5,
    completedCount,
    totalNeeded,
    spinCount
  };
}

function spinWheel(userId, isPlus) {
  const today = getBeijingDate();
  const check = canSpinWheel(userId);
  if (!check.canSpin) {
    return { ok: false, msg: '完成更多任务后才能抽奖' };
  }

  const idx = weightedRandom();
  const segment = SEGMENTS[idx];
  let reward = segment.credit;
  const rewardType = segment.type || 'credit';

  if (rewardType === 'credit' && reward > 0) {
    if (isPlus) reward = reward * 2;
    // 发放积分
    const users = db.readUsers();
    const uidx = users.findIndex(u => u.id === userId);
    if (uidx !== -1) {
      users[uidx].credit = (users[uidx].credit || 0) + reward;
      db.writeUsers(users);
      const logs = db.readCreditLogs();
      logs.push({
        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId, amount: reward,
        reason: '幸运转盘：' + segment.label,
        createdAt: new Date().toISOString()
      });
      db.writeCreditLogs(logs);
    }
  }

  // 记录转盘记录
  db.runSql(
    'INSERT INTO lucky_wheel_spins (userId, date, reward, rewardType, createdAt) VALUES (?, ?, ?, ?, ?)',
    [userId, today, reward, rewardType, new Date().toISOString()]
  );

  return { ok: true, rewardType, reward, segment: { label: segment.label } };
}

function getSpinHistory(userId, limit) {
  return db.allSql(
    'SELECT * FROM lucky_wheel_spins WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
    [userId, limit || 10]
  );
}

module.exports = { spinWheel, canSpinWheel, getSpinHistory };
