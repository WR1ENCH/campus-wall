// ===== routes/checkin.js - 签到系统模块 =====
const db = require('../db');

// 初始化表
function ensureTable() {
  db.runSql(`CREATE TABLE IF NOT EXISTS "checkin_calendar" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "streak" INTEGER DEFAULT 1,
    "reward" INTEGER DEFAULT 0,
    "isPlus" INTEGER DEFAULT 0,
    "createdAt" TEXT
  )`);
}
ensureTable();

function getBeijingDate(d) {
  d = d || new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const bd = new Date(utc + 8 * 3600000);
  return bd.getFullYear() + '-' +
    String(bd.getMonth() + 1).padStart(2, '0') + '-' +
    String(bd.getDate()).padStart(2, '0');
}

function yesterdayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  d.setDate(d.getDate() - 1);
  return getBeijingDate(d);
}

// 奖励递增表
function calcReward(streak) {
  const baseTable = [0, 10, 15, 20, 25, 30, 35]; // index 0 unused
  let base;
  if (streak <= 6) base = baseTable[streak] || 10;
  else if (streak < 14) base = 50;
  else if (streak < 30) base = 50;
  else if (streak < 100) base = 100;
  else if (streak < 365) base = 200;
  else base = 500;
  return base;
}

function getCheckinCalendar(userId, yearMonth) {
  const rows = db.allSql(
    'SELECT * FROM checkin_calendar WHERE userId = ? AND date LIKE ? ORDER BY date',
    [userId, yearMonth + '%']
  );
  return rows;
}

function processCheckin(userId, isRepair) {
  const today = getBeijingDate();
  const isPlus = require('../lib/subscription').isUserPlus(userId);

  // 检查今日是否已签到
  const existing = db.allSql(
    'SELECT * FROM checkin_calendar WHERE userId = ? AND date = ?',
    [userId, today]
  );
  if (existing.length > 0 && !isRepair) {
    return { ok: false, msg: '今天已签到，明天再来吧' };
  }

  // 计算连续天数
  const yesterday = yesterdayDate(today);
  const yesterdayRecord = db.allSql(
    'SELECT * FROM checkin_calendar WHERE userId = ? AND date = ?',
    [userId, yesterday]
  );

  let streak = 1;
  if (yesterdayRecord.length > 0) {
    streak = (yesterdayRecord[0].streak || 0) + 1;
  } else if (isRepair) {
    // 补签：从昨日记录继续
    streak = (yesterdayRecord[0] ? yesterdayRecord[0].streak : 0) + 1;
  }

  let reward = calcReward(streak);
  if (isPlus) reward = Math.floor(reward * 2);

  // 插入签到记录
  db.runSql(
    'INSERT INTO checkin_calendar (userId, date, streak, reward, isPlus, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, isRepair ? yesterday : today, streak, reward, isPlus ? 1 : 0, new Date().toISOString()]
  );

  // 给用户加积分
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].credit = (users[idx].credit || 0) + reward;
    users[idx].checkinStreak = streak;
    users[idx].checkedInDate = today;
    db.writeUsers(users);

    // 记录积分流水
    const logs = db.readCreditLogs();
    logs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId, amount: reward,
      reason: '每日签到（连续 ' + streak + ' 天）' + (isRepair ? '（补签）' : ''),
      createdAt: new Date().toISOString()
    });
    db.writeCreditLogs(logs);
  }

  return { ok: true, data: { reward, streak } };
}

module.exports = { getCheckinCalendar, processCheckin, getBeijingDate };
