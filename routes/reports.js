// ===== routes/reports.js - 统一举报入口（新版，生成 REPO- 唯一ID） =====
const db = require('../db');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { verifyUserToken } = require('../lib/crypto');
const penalty = require('../lib/penalty');

function readReports() { return db.readReports(); }
function writeReports(reports) { db.writeReports(reports); }
function readUsers() { return db.readUsers(); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSENotice(); }
function broadcastSSENotice() { require('../lib/sse').broadcastSSE('noticeUpdate', { t: Date.now() }); }

// 内容类型 → 中文标签
const TYPE_LABELS = {
  post: '帖子', comment: '帖子评论', discussion: '讨论话题',
  discussion_comment: '讨论评论', qa_question: '问答问题',
  qa_answer: '问答回答', featured: '校园墙精选', auction: '拍卖内容',
};

// 统一创建举报：生成 REPO- ID、存证据快照、发受理通知
function createReport({ type, targetId, postId, reason, reporterId, reporterName, extra }) {
  const reportId = generateId('REPO');
  const content = penalty.getReportedContent(type === 'featured' ? 'post' : type, targetId);
  const evidence = {
    content: content.content || '',
    images: content.images || [],
  };
  const report = {
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    reportId,
    type,
    targetId,
    postId: postId || (type === 'post' || type === 'featured' ? targetId : undefined),
    reason: (reason || '').trim(),
    reportedBy: reporterId || null,
    reporterName: reporterName || '匿名用户',
    reportedUserId: content.userId || null,
    evidenceContent: JSON.stringify(evidence),
    createdAt: new Date().toISOString(),
    status: 'pending',
    handledResult: null,
    punishmentId: null,
  };
  if (extra) Object.assign(report, extra);
  const reports = readReports();
  reports.push(report);
  writeReports(reports);
  logIdAssignment('report', reportId, (reason || '').slice(0, 100), db);
  // 举报受理通知（含举报ID）
  if (reporterId) {
    penalty.notifyReportReceived(reporterId, reportId,
      '举报类型：' + (TYPE_LABELS[type] || type) + '\n举报原因：' + report.reason);
  }
  return report;
}

// 按 id 或 reportId 查找
function getReportByAnyId(key) {
  const reports = readReports();
  return reports.find(r => r.reportId === key || r.id === key) || null;
}

// 丰富举报详情（举报人/被举报人信息 + 内容证据 + 图片）
function enrichReport(report) {
  if (!report) return null;
  const users = readUsers();
  const reporter = report.reportedBy ? users.find(u => u.id === report.reportedBy) : null;
  let reported = null;
  if (report.reportedUserId) reported = users.find(u => u.id === report.reportedUserId);
  let evidence = {};
  try { evidence = report.evidenceContent ? JSON.parse(report.evidenceContent) : {}; } catch { evidence = {}; }
  return {
    ...report,
    typeLabel: TYPE_LABELS[report.type] || report.type,
    reporterInfo: reporter ? { nickname: reporter.nickname, username: reporter.username, uid: reporter.uid } : null,
    reportedInfo: reported ? { nickname: reported.nickname, username: reported.username, uid: reported.uid } : null,
    evidence,
  };
}

module.exports = function (app) {
  // 统一公开举报入口
  app.post('/api/reports', (req, res) => {
    let { type, targetId, postId, reason } = req.body;
    // 兼容旧前端：仅传 postId 时按帖子举报
    if (!type && postId) { type = 'post'; targetId = postId; }
    const allowed = ['post', 'comment', 'discussion', 'discussion_comment', 'qa_question', 'qa_answer', 'featured', 'auction'];
    if (!allowed.includes(type)) return res.json({ ok: false, msg: '不支持的举报类型' });
    if (!targetId) return res.json({ ok: false, msg: '缺少内容ID' });
    if (!reason || !reason.trim()) return res.json({ ok: false, msg: '请选择举报原因' });

    let reporterId = null, reporterName = '匿名用户';
    const token = req.headers['x-user-token'];
    if (token) {
      const session = verifyUserToken(token);
      if (session) { reporterId = session.id; reporterName = session.nickname || '匿名用户'; }
    }
    // 允许匿名举报，但建议登录
    try {
      const report = createReport({ type, targetId, postId, reason, reporterId, reporterName });
      res.json({ ok: true, data: { reportId: report.reportId } });
    } catch (e) {
      console.error('[reports] 创建举报失败:', e.message);
      res.json({ ok: false, msg: '举报提交失败' });
    }
  });

  // 举报详情（举报人或管理员可看）
  app.get('/api/reports/:reportId', (req, res) => {
    const token = req.headers['x-user-token'];
    const adminToken = req.headers['x-admin-token'];
    const report = getReportByAnyId(req.params.reportId);
    if (!report) return res.json({ ok: false, msg: '举报不存在' });
    const isAdmin = !!adminToken;
    const session = token ? verifyUserToken(token) : null;
    if (!isAdmin && !(session && report.reportedBy === session.id)) {
      return res.json({ ok: false, msg: '无权查看', code: 'FORBIDDEN' });
    }
    res.json({ ok: true, data: enrichReport(report) });
  });

  // 我的举报记录（安全中心）
  app.get('/api/user/my-reports', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const reports = readReports().filter(r => r.reportedBy === session.id);
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, data: reports.map(r => ({
      reportId: r.reportId, type: r.type, typeLabel: TYPE_LABELS[r.type] || r.type,
      reason: r.reason, status: r.status, handledResult: r.handledResult,
      punishmentId: r.punishmentId, createdAt: r.createdAt,
    })) });
  });
};

module.exports.createReport = createReport;
module.exports.getReportByAnyId = getReportByAnyId;
module.exports.enrichReport = enrichReport;
module.exports.TYPE_LABELS = TYPE_LABELS;
