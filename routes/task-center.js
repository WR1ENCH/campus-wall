const { verifyUserToken } = require('../lib/crypto');
const { isUserPlus } = require('../lib/subscription');
const { getCheckinCalendar, processCheckin, getBeijingDate } = require('./checkin');
const { generateDailyTasks, getDailyTasks, updateTaskProgress, claimTaskReward } = require('./daily-tasks');
const { spinWheel, canSpinWheel, getSpinHistory } = require('./lucky-wheel');
const { checkAndUnlockAchievements, getUserAchievements } = require('./achievements');
const db = require('../db');

module.exports = function(app) {
  function authMiddleware(req, res, next) {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
    req.userId = session.id;
    next();
  }

  app.get('/api/user/checkin-calendar', authMiddleware, (req, res) => {
    const { month } = req.query;
    const yearMonth = month || getBeijingDate().slice(0, 7);
    const calendar = getCheckinCalendar(req.userId, yearMonth);
    res.json({ ok: true, data: calendar });
  });

  app.post('/api/user/checkin', authMiddleware, (req, res) => {
    const result = processCheckin(req.userId, false);
    if (result.ok) checkAndUnlockAchievements(req.userId);
    res.json(result);
  });

  app.post('/api/user/checkin/repair', authMiddleware, (req, res) => {
    const { date } = req.body;
    if (!date) return res.json({ ok: false, msg: '请提供补签日期' });
    
    const users = db.readUsers();
    const user = users.find(u => u.id === req.userId);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    
    if ((user.repair_card_count || 0) <= 0) {
      return res.json({ ok: false, msg: '补签卡不足' });
    }
    
    const today = getBeijingDate();
    if (date >= today) {
      return res.json({ ok: false, msg: '不能补签今天及以后' });
    }
    
    const existing = db.allSql(
      'SELECT * FROM checkin_calendar WHERE userId = ? AND date = ?',
      [req.userId, date]
    );
    if (existing.length > 0) {
      return res.json({ ok: false, msg: '该日期已签到' });
    }
    
    const result = processCheckin(req.userId, true);
    if (result.ok) {
      const userIdx = users.findIndex(u => u.id === req.userId);
      users[userIdx].repair_card_count = (users[userIdx].repair_card_count || 0) - 1;
      db.writeUsers(users);
      checkAndUnlockAchievements(req.userId);
    }
    
    res.json(result);
  });

  app.get('/api/user/daily-tasks', authMiddleware, (req, res) => {
    const isPlus = isUserPlus(req.userId);
    generateDailyTasks(req.userId, isPlus);
    const result = getDailyTasks(req.userId);
    res.json(result);
  });

  app.post('/api/user/daily-tasks/:id/claim', authMiddleware, (req, res) => {
    const result = claimTaskReward(req.userId, req.params.id);
    if (result.ok) checkAndUnlockAchievements(req.userId);
    res.json(result);
  });

  app.get('/api/user/lucky-wheel/can-spin', authMiddleware, (req, res) => {
    const result = canSpinWheel(req.userId);
    res.json({ ok: true, data: result });
  });

  app.post('/api/user/lucky-wheel/spin', authMiddleware, (req, res) => {
    const isPlus = isUserPlus(req.userId);
    const result = spinWheel(req.userId, isPlus);
    res.json(result);
  });

  app.get('/api/user/lucky-wheel/history', authMiddleware, (req, res) => {
    const { limit } = req.query;
    const history = getSpinHistory(req.userId, parseInt(limit) || 10);
    res.json({ ok: true, data: history });
  });

  app.get('/api/user/achievements', authMiddleware, (req, res) => {
    const result = getUserAchievements(req.userId);
    res.json(result);
  });

  app.post('/api/user/achievements/check', authMiddleware, (req, res) => {
    const result = checkAndUnlockAchievements(req.userId);
    res.json(result);
  });
};
