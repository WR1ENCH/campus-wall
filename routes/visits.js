// ===== routes/visits.js - 主页访客记录 =====
const { verifyUserToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');

// 访客记录速率限制（同用户对同目标每5分钟最多1次）
const visitRateLimit = new Map();
const VISIT_RATE_WINDOW = 5 * 60 * 1000; // 5 分钟

module.exports = function(app) {
  // ===== 记录访问 =====
  app.post('/api/user/profile-visit', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session || !session.id) return res.json({ ok: false, msg: '登录已过期' });

    const { visitedUserId } = req.body;
    if (!visitedUserId) return res.json({ ok: false, msg: '缺少 visitedUserId' });
    // 禁止自访
    if (session.id === visitedUserId) return res.json({ ok: true });

    // 速率限制
    const rlKey = 'pv_' + session.id + '_' + visitedUserId;
    const now = Date.now();
    const lastVisit = visitRateLimit.get(rlKey);
    if (lastVisit && now - lastVisit < VISIT_RATE_WINDOW) {
      const remain = Math.ceil((VISIT_RATE_WINDOW - (now - lastVisit)) / 1000);
      return res.json({ ok: false, msg: '操作太频繁，请 ' + remain + ' 秒后再试' });
    }
    visitRateLimit.set(rlKey, now);

    db.addProfileVisit({
      id: undefined, // generateId('PV') inside addProfileVisit
      visitedUserId,
      visitorUserId: session.id,
      createdAt: new Date().toISOString(),
      read: 0
    });

    // 可选：SSE 广播
    broadcastSSE('profileVisit', { visitedUserId });

    res.json({ ok: true });
  });

  // ===== 获取访客列表（分页） =====
  app.get('/api/user/profile-visits', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session || !session.id) return res.json({ ok: false, msg: '登录已过期' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const result = db.getProfileVisits(session.id, page, limit);
    const users = db.readUsers();

    // 为每条记录附加访客信息
    const visits = result.visits.map(v => {
      const visitor = users.find(u => u.id === v.visitorUserId);
      return {
        id: v.id,
        visitorUserId: v.visitorUserId,
        visitorNickname: visitor ? visitor.nickname : '未知用户',
        visitorAvatar: visitor ? visitor.avatar : '',
        createdAt: v.createdAt,
        read: v.read
      };
    });

    res.json({
      ok: true,
      data: {
        total: result.total,
        unreadCount: db.getUnreadVisitCount(session.id),
        page,
        limit,
        visits
      }
    });
  });

  // ===== 未读访客数 =====
  app.get('/api/user/profile-visits/unread-count', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session || !session.id) return res.json({ ok: false, msg: '登录已过期' });

    const count = db.getUnreadVisitCount(session.id);
    res.json({ ok: true, data: { count } });
  });

  // ===== 标记已读 =====
  app.post('/api/user/profile-visits/mark-read', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session || !session.id) return res.json({ ok: false, msg: '登录已过期' });

    const { visitId, all } = req.body;
    if (all) {
      db.markAllVisitsRead(session.id);
    } else if (visitId) {
      db.markVisitRead(visitId, session.id);
    } else {
      return res.json({ ok: false, msg: '请提供 visitId 或设置 all=true' });
    }

    res.json({ ok: true });
  });

  // ===== 每日访客汇总通知（北京时间 12:00 触发） =====
  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    // 北京时间 12:00
    if ((utcHour + 8) % 24 === 12 && utcMin === 0) {
      sendDailyVisitorSummary();
    }
  }, 60000);

  function sendDailyVisitorSummary() {
    try {
      const grouped = db.getYesterdayVisitsGrouped();
      if (!grouped.length) return;
      const users = db.readUsers();
      const notices = db.readNotices();
      const userNotifs = db.readUserNotifications();

      for (const row of grouped) {
        const user = users.find(u => u.id === row.visitedUserId);
        if (!user) continue;

        const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        notices.push({
          id: notificationId,
          title: '👋 主页访客',
          content: '昨日有 **' + row.count + '** 名用户查看了你的主页，[点击查看](/user.html?id=' + row.visitedUserId + '&autoOpenVisitors=true)',
          author: '系统',
          auto: true,
          level: 'T1',
          createdAt: new Date().toISOString(),
          targetUserId: row.visitedUserId
        });
        userNotifs.push({
          notificationId,
          userId: row.visitedUserId,
          read: 0,
          createdAt: new Date().toISOString()
        });
      }

      db.writeNotices(notices);
      db.writeUserNotifications(userNotifs);
      broadcastSSE('noticeUpdate', { t: Date.now() });
    } catch (e) {
      console.error('[访客通知] 发送失败:', e.message);
    }
  }
};
