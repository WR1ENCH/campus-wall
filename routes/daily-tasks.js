// ===== routes/daily-tasks.js - 每日任务模块 =====
const db = require('../db');
const { getBeijingDate } = require('./checkin');

function ensureTable() {
  db.runSql(`CREATE TABLE IF NOT EXISTS "daily_tasks" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "taskIcon" TEXT,
    "targetCount" INTEGER DEFAULT 1,
    "currentCount" INTEGER DEFAULT 0,
    "reward" INTEGER DEFAULT 0,
    "completed" INTEGER DEFAULT 0,
    "claimed" INTEGER DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    UNIQUE(userId, date, taskType)
  )`);
  // Fix any tasks with NULL id (from older server versions)
  try {
    const nullIds = db.allSql('SELECT rowid FROM daily_tasks WHERE id IS NULL');
    for (const row of nullIds) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let newId = 'DT-';
      for (let i = 0; i < 20; i++) newId += chars[Math.floor(Math.random() * chars.length)];
      db.runSql('UPDATE daily_tasks SET id = ? WHERE rowid = ?', [newId, row.rowid]);
    }
  } catch (e) { /* ignore if table doesn't exist yet */ }
}
ensureTable();

const TASK_POOL = [
  { type: 'post', title: '发布帖子', desc: '发布1篇帖子', icon: '✍️', target: 1, reward: 15 },
  { type: 'comment', title: '评论互动', desc: '评论2条帖子', icon: '💬', target: 2, reward: 10 },
  { type: 'answer', title: '回答问题', desc: '回答1个QA问题', icon: '💡', target: 1, reward: 20 },
  { type: 'like', title: '点赞支持', desc: '点赞3篇帖子', icon: '❤️', target: 3, reward: 10 },
  { type: 'whisper', title: '悄悄话', desc: '发送1条悄悄话', icon: '🤫', target: 1, reward: 15 },
  { type: 'visit', title: '串门拜访', desc: '访问1个用户主页', icon: '👀', target: 1, reward: 5 },
  { type: 'browse', title: '浏览发现', desc: '浏览10篇帖子', icon: '📱', target: 10, reward: 10 },
  { type: 'search', title: '搜索用户', desc: '搜索1个用户', icon: '🔍', target: 1, reward: 5 },
  { type: 'notification', title: '查看通知', desc: '查看通知中心', icon: '🔔', target: 1, reward: 5 },
];

const PLUS_TASK = { type: 'like_received', title: '本周获赞', desc: '本周收到5个赞', icon: '⭐', target: 5, reward: 50 };

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateDailyTasks(userId, isPlus) {
  const today = getBeijingDate();
  const existing = db.allSql(
    'SELECT * FROM daily_tasks WHERE userId = ? AND date = ?',
    [userId, today]
  );
  if (existing.length > 0) return; // 已生成

  const count = isPlus ? 5 : 3 + Math.floor(Math.random() * 2); // 3-4 for non-PLUS
  const shuffled = shuffle(TASK_POOL);
  const selected = shuffled.slice(0, count);

  const now = new Date().toISOString();
  function genId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'DT-';
    for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }
  for (const task of selected) {
    db.runSql(
      `INSERT INTO daily_tasks (id, userId, date, taskType, taskTitle, taskDescription, taskIcon, targetCount, currentCount, reward, completed, claimed, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?)`,
      [genId(), userId, today, task.type, task.title, task.desc, task.icon, task.target, task.reward, now]
    );
  }

  // PLUS 用户额外加一个高奖励任务
  if (isPlus) {
    db.runSql(
      `INSERT INTO daily_tasks (id, userId, date, taskType, taskTitle, taskDescription, taskIcon, targetCount, currentCount, reward, completed, claimed, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?)`,
      [genId(), userId, today, PLUS_TASK.type, PLUS_TASK.title, PLUS_TASK.desc, PLUS_TASK.icon, PLUS_TASK.target, PLUS_TASK.reward, now]
    );
  }
}

function getDailyTasks(userId) {
  const today = getBeijingDate();
  const tasks = db.allSql(
    'SELECT * FROM daily_tasks WHERE userId = ? AND date = ? ORDER BY id',
    [userId, today]
  );
  return { ok: true, tasks };
}

function updateTaskProgress(userId, taskType) {
  const today = getBeijingDate();
  const tasks = db.allSql(
    'SELECT * FROM daily_tasks WHERE userId = ? AND date = ? AND taskType = ? AND completed = 0',
    [userId, today, taskType]
  );
  for (const task of tasks) {
    const newCount = Math.min(task.currentCount + 1, task.targetCount);
    const completed = newCount >= task.targetCount ? 1 : 0;
    db.runSql(
      'UPDATE daily_tasks SET currentCount = ?, completed = ? WHERE id = ?',
      [newCount, completed, task.id]
    );
  }
}

function claimTaskReward(userId, taskId) {
  const task = db.allSql('SELECT * FROM daily_tasks WHERE id = ? AND userId = ?', [taskId, userId]);
  if (!task.length) return { ok: false, msg: '任务不存在' };
  const t = task[0];
  if (!t.completed) return { ok: false, msg: '任务未完成' };
  if (t.claimed) return { ok: false, msg: '已领取过奖励' };

  db.runSql('UPDATE daily_tasks SET claimed = 1 WHERE id = ?', [taskId]);

  // 发放奖励
  const users = db.readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].credit = (users[idx].credit || 0) + t.reward;
    db.writeUsers(users);

    const logs = db.readCreditLogs();
    logs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId, amount: t.reward,
      reason: '每日任务奖励：' + t.taskTitle,
      createdAt: new Date().toISOString()
    });
    db.writeCreditLogs(logs);
  }

  return { ok: true, msg: '奖励已领取', reward: t.reward };
}

module.exports = { generateDailyTasks, getDailyTasks, updateTaskProgress, claimTaskReward };
