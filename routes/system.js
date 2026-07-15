const crypto = require('crypto');
const { verifyUserToken, signToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const { onlineUsers } = require('../lib/state');
const db = require('../db');
const hotness = require('../lib/hotness');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName } = require('../bullyingNames');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const maintenance = require('../maintenance');

const ONLINE_TIMEOUT = 120000;

function readPosts() { return db.readPosts(); }
function writePosts(posts) { db.writePosts(posts); broadcastSSE('postUpdate', { t: Date.now() }); }
function getPostCount(opts) { return db.getPostCount(opts); }
function readFeedbacks() { return db.readFeedbacks(); }
function writeFeedbacks(feedbacks) { db.writeFeedbacks(feedbacks); }
function readBullying() { return db.readBullying(); }
function writeBullying(data) { db.writeBullying(data); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }

module.exports = function(app, opts) {
  const { sseClients, cachedGitSha, cachedCommitMsg } = opts;
  let sseEventCounter = 0;

  // 心跳保活：每 15 秒给所有连接发一个 ping，防止中间代理断开
  setInterval(() => {
    const pingMsg = `id: ${++sseEventCounter}\nevent: ping\ndata: ${JSON.stringify({ t: Date.now(), clients: sseClients.size })}\n\n`;
    for (const client of sseClients) {
      try { client.write(pingMsg); } catch (e) {}
    }
  }, 15000);

  app.get('/api/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`retry: 3000\n`);
    res.write(`id: ${++sseEventCounter}\nevent: connected\ndata: ${JSON.stringify({ t: Date.now(), clients: sseClients.size + 1 })}\n\n`);
    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); });
  });

  // 心跳接口（用户登录后定时调用）
  app.post('/api/user/heartbeat', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
    const session = verifyUserToken(token);
    if (!session || !session.id) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
    onlineUsers.set(session.id, Date.now());
    res.json({ ok: true });
  });

  // 统计接口（含今日帖数、在线人数、全站热度）
  app.get('/api/stats', (req, res) => {
    // 清理过期
    const now = Date.now();
    for (const [id, ts] of onlineUsers) {
      if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
    }
    // 今日帖数
    const posts = readPosts();
    const today = new Date().toISOString().slice(0, 10);
    const todayPosts = posts.filter(p => p.time && p.time.startsWith(today)).length;
    res.json({ ok: true, data: { todayPosts, onlineCount: onlineUsers.size, hotValue: hotness.getCachedHotness() } });
  });

  // 全站热度周期重算：每 5 分钟计算一次（算法见 lib/hotness.js 注释）
  setInterval(() => {
    hotness.recompute();
  }, 5 * 60 * 1000);
  // 启动时立即算一次初始值
  hotness.recompute();

  // 版本号接口（返回本地 git 哈希）
  app.get('/api/version', (req, res) => {
    res.json({ ok: true, data: { sha: cachedGitSha, message: cachedCommitMsg } });
  });

  // 每分钟清理一次过期心跳
  setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of onlineUsers) {
      if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
    }
  }, 60000);

  // 用户反馈提交
  app.post('/api/feedback', (req, res) => {
    const { type, description, contact, images } = req.body;
    if (!type || !description) return res.json({ ok: false, msg: '类型和描述不能为空' });
    if (description.length < 10) return res.json({ ok: false, msg: '描述至少10个字' });
    if (description.length > 500) return res.json({ ok: false, msg: '描述最多500字' });

    const feedbacks = readFeedbacks();
    const newFeedback = {
      id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: type,
      description: description,
      contact: contact || '',
      images: images || [],
      time: new Date().toISOString(),
      status: 'pending',
      handledBy: null,
      handledAt: null,
      handleNote: null
    };
    feedbacks.unshift(newFeedback);
    writeFeedbacks(feedbacks);
    res.json({ ok: true });
  });

  // 霸凌事件报告提交
  app.post('/api/bullying-report', (req, res) => {
    const { reporterRole, victimName, bullyType, description, involved, location, time, contact, anonymous, images } = req.body;
    if (!reporterRole || !['self', 'witness'].includes(reporterRole)) return res.json({ ok: false, msg: '请选择您的身份' });
    if (!bullyType || !description) return res.json({ ok: false, msg: '霸凌类型和描述不能为空' });
    if (description.length < 20) return res.json({ ok: false, msg: '描述至少20个字' });
    if (description.length > 1000) return res.json({ ok: false, msg: '描述最多1000字' });
    if (!anonymous && !contact) return res.json({ ok: false, msg: '实名提交必须填写联系方式' });

    // 尝试获取提交者 userId
    let reporterUserId = null;
    try {
      const token = req.headers['x-user-token'];
      if (token) {
        const session = verifyUserToken(token);
        if (session) reporterUserId = session.id;
      }
    } catch (e) {}

    const reports = readBullying();

    // 自我举报 → 自动将受害者姓名加入保护名单
    if (reporterRole === 'self' && victimName) {
      addBullyingName(victimName);
    }

    const reportId = generateId('BULL');
    const newReport = {
      id: reportId,
      reportId: reportId,
      reporterRole: reporterRole,
      victimName: (reporterRole === 'self' && victimName) ? victimName : null,
      bullyType: bullyType,
      description: description,
      involved: involved || '',
      involvedUsers: (req.body.involvedUsers || []),
      contentIds: (req.body.contentIds || []),
      location: location || '',
      incidentTime: time || '',
      contact: anonymous ? '' : (contact || ''),
      anonymous: !!anonymous,
      images: (images || []).slice(0, 3),
      time: new Date().toISOString(),
      status: 'pending',
      handledBy: null,
      handledAt: null,
      handleNote: null,
      userId: reporterUserId
    };
    reports.unshift(newReport);
    writeBullying(reports);
    logIdAssignment('bullying', reportId, (bullyType || ''), db);

    // 发送 T1 通知
    if (reporterUserId) {
      try {
        const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const notices = readNotices();
        notices.push({
          id: notificationId,
          title: '🛡️ 霸凌举报已收到',
          content: '你的霸凌事件报告已提交给管理员审核。\n\n我们将尽快核实并处理，请保持联系方式畅通。\n\n感谢你对校园安全的关注！',
          author: '系统',
          auto: true,
          level: 'T1',
          createdAt: new Date().toISOString(),
        targetUserId: reporterUserId
        });
        writeNotices(notices);
        // 同时写入 user_notifications 表
        db.addUserNotification({
          notificationId,
          userId: reporterUserId,
          read: 0,
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        console.error('发送霸凌举报通知失败:', e.message);
      }
    }

    res.json({ ok: true, data: { id: newReport.id } });
  });

  // 公开接口：维护页面轮询用（不暴露敏感信息）
  app.get('/api/maintenance/info', (req, res) => {
    try {
      const data = db.readMaintenance() || { enabled: false };
      res.json({
        ok: true,
        data: {
          enabled: data.enabled === true || data.enabled === 'true',
          botTesting: data.botTesting === true || data.botTesting === 'true',
          message: data.message || null,
          updatedAt: data.updatedAt || null
        }
      });
    } catch (e) {
      res.json({ ok: true, data: { enabled: false, botTesting: false } });
    }
  });

};
