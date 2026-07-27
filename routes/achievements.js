// ===== routes/achievements.js - 成就系统模块 =====
const db = require('../db');
const { getBeijingDate } = require('./checkin');

function ensureTable() {
  db.runSql(`CREATE TABLE IF NOT EXISTS "user_achievements" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TEXT,
    "progress" INTEGER DEFAULT 0,
    "target" INTEGER DEFAULT 1
  )`);
  // 迁移：确保 target 列存在
  const cols = db.allSql("PRAGMA table_info(user_achievements)").map(c => c.name);
  if (!cols.includes('target')) {
    db.runSql('ALTER TABLE user_achievements ADD COLUMN target INTEGER DEFAULT 1');
  }
}
ensureTable();

const ACHIEVEMENT_DEFS = [
  { id: 'first_checkin', name: '初次签到', icon: '🌟', desc: '完成第一次签到', target: 1 },
  { id: 'week_active', name: '周活跃者', icon: '🏅', desc: '连续签到7天', target: 7 },
  { id: 'first_task', name: '初来乍到', icon: '📋', desc: '完成第1个每日任务', target: 1 },
  { id: 'task_master', name: '任务达人', icon: '🎯', desc: '连续7天完成全部每日任务', target: 7 },
  { id: 'month_pioneer', name: '月度先锋', icon: '👑', desc: '连续签到30天', target: 30 },
  { id: 'social_butterfly', name: '社交达人', icon: '🦋', desc: '累计发送100条悄悄话', target: 100 },
  { id: 'content_creator', name: '内容创作者', icon: '✍️', desc: '累计发布50篇帖子', target: 50 },
  { id: 'explorer', name: '探索家', icon: '🔭', desc: '累计浏览500篇帖子', target: 500 },
  { id: 'campus_guardian', name: '校园守望者', icon: '🛡️', desc: '连续签到100天', target: 100 },
  { id: 'year_legend', name: '年度传奇', icon: '🏆', desc: '连续签到365天', target: 365 },
];

function getUserAchievements(userId) {
  const records = db.allSql(
    'SELECT * FROM user_achievements WHERE userId = ?',
    [userId]
  );
  const recordMap = {};
  for (const r of records) recordMap[r.achievementId] = r;

  const achievements = ACHIEVEMENT_DEFS.map(def => {
    const rec = recordMap[def.id];
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: def.desc,
      unlocked: rec && rec.unlockedAt ? true : false,
      unlockedAt: rec ? rec.unlockedAt : null,
      progress: rec ? rec.progress : 0,
      target: def.target,
    };
  });

  return { ok: true, achievements };
}

function checkAndUnlockAchievements(userId) {
  const unlocked = [];
  const users = db.readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { ok: false, unlocked: [] };

  // 统计用户数据
  const checkinCount = db.allSql(
    'SELECT COUNT(*) as cnt FROM checkin_calendar WHERE userId = ?',
    [userId]
  )[0]?.cnt || 0;
  const streak = Number(user.checkinStreak) || 0;

  const tasksCompleted = db.allSql(
    'SELECT COUNT(*) as cnt FROM daily_tasks WHERE userId = ? AND claimed = 1',
    [userId]
  )[0]?.cnt || 0;
  const postsCreated = db.allSql(
    'SELECT COUNT(*) as cnt FROM posts WHERE userId = ? AND IFNULL(deleted,0) = 0',
    [userId]
  )[0]?.cnt || 0;
  const whispersSent = db.allSql(
    'SELECT COUNT(*) as cnt FROM whispers WHERE senderId = ?',
    [userId]
  )[0]?.cnt || 0;

  // 连续完成全部任务的天数（简化：看最近7天是否全部完成）
  let fullTaskDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getBeijingDate(d);
    const dayTasks = db.allSql(
      'SELECT * FROM daily_tasks WHERE userId = ? AND date = ?',
      [userId, dateStr]
    );
    if (dayTasks.length > 0 && dayTasks.every(t => t.claimed)) {
      fullTaskDays++;
    } else {
      break;
    }
  }

  // 检查每个成就
  for (const def of ACHIEVEMENT_DEFS) {
    let progress = 0;
    switch (def.id) {
      case 'first_checkin': progress = checkinCount; break;
      case 'week_active': progress = streak; break;
      case 'first_task': progress = tasksCompleted; break;
      case 'task_master': progress = fullTaskDays; break;
      case 'month_pioneer': progress = streak; break;
      case 'campus_guardian': progress = streak; break;
      case 'year_legend': progress = streak; break;
      case 'content_creator': progress = postsCreated; break;
      case 'social_butterfly': progress = whispersSent; break;
      case 'explorer': progress = 0; break;
      default: progress = 0; break;
    }

    const existing = db.allSql(
      'SELECT * FROM user_achievements WHERE userId = ? AND achievementId = ?',
      [userId, def.id]
    );

    if (existing.length > 0) {
      // 更新进度
      db.runSql(
        'UPDATE user_achievements SET progress = ? WHERE userId = ? AND achievementId = ?',
        [progress, userId, def.id]
      );
      // 如果未解锁且达标，解锁
      if (!existing[0].unlockedAt && progress >= def.target) {
        db.runSql(
          'UPDATE user_achievements SET unlockedAt = ? WHERE userId = ? AND achievementId = ?',
          [new Date().toISOString(), userId, def.id]
        );
        unlocked.push({ id: def.id, name: def.name, icon: def.icon });
      }
    } else {
      // 新记录
      const unlockedAt = progress >= def.target ? new Date().toISOString() : null;
      db.runSql(
        'INSERT INTO user_achievements (userId, achievementId, progress, target, unlockedAt) VALUES (?, ?, ?, ?, ?)',
        [userId, def.id, progress, def.target, unlockedAt]
      );
      if (unlockedAt) {
        unlocked.push({ id: def.id, name: def.name, icon: def.icon });
      }
    }
  }

  return { ok: true, unlocked };
}

module.exports = { checkAndUnlockAchievements, getUserAchievements };
