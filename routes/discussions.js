const { verifyUserToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const uniqueId = require('../lib/uniqueId');
const db = require('../db');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked } = require('../lib/penalty');
const credibility = require('../lib/credibility');

const CONTENT_MAX_LENGTH = 50;

// 评论删除接口按 IP 限流（与 postRateLimit 同款内存 Map，无新依赖）
const commentDeleteLimit = new Map();
const COMMENT_DELETE_WINDOW_MS = 60 * 1000;
const COMMENT_DELETE_MAX = 30;
// 用户创建话题频率限制（1分钟内最多5个）
const discussionCreateLimit = new Map();
const DISCUSSION_CREATE_WINDOW_MS = 60000;
const DISCUSSION_CREATE_MAX = 5;
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of commentDeleteLimit) {
    const kept = ts.filter(t => now - t < COMMENT_DELETE_WINDOW_MS);
    if (kept.length === 0) commentDeleteLimit.delete(ip);
    else commentDeleteLimit.set(ip, kept);
  }
  for (const [id, ts] of discussionCreateLimit) {
    const kept = ts.filter(t => now - t < DISCUSSION_CREATE_WINDOW_MS);
    if (kept.length === 0) discussionCreateLimit.delete(id);
    else discussionCreateLimit.set(id, kept);
  }
}, 60000);

function readDiscussions() { return db.readDiscussions(); }
function writeDiscussions(data) { db.writeDiscussions(data); broadcastSSE('discussionUpdate', { t: Date.now() }); }
function readDiscussionComments() { return db.readDiscussionComments(); }
function writeDiscussionComments(data) { db.writeDiscussionComments(data); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readPosts() { return db.readPosts(); }
function writePosts(posts) { db.writePosts(posts); broadcastSSE('postUpdate', { t: Date.now() }); }
function readReports() { return db.readReports(); }
function writeReports(reports) { db.writeReports(reports); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }

function saveDeletedItem(type, item, deletedBy, extra) {
  const extraData = Object.assign({
    time: item.time || item.createdAt || null,
    likeCount: item.likes || 0,
    commentCount: item.commentsCount || 0,
    title: item.title || null,
  }, typeof extra === 'object' ? extra : {});
  db.addDeletedItem({
    id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    content: typeof item.content === 'string' ? item.content.substring(0, 500) : '',
    author: item.author || item.nickname || item.createdBy || '未知',
    userId: item.userId || item.createdBy || null,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy,
    extra: JSON.stringify(extraData)
  });
}

function hasSpecialChars(str) {
  return /[<>"'&]/.test(str);
}

function parseLocalDateTime(str) {
  if (!str) return null;
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  return null;
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.json({ ok: false, msg: '未登录，请先登录', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
  if (!['super', 'admin'].includes(session.role)) {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
  if (Date.now() - session.loginAt > 24 * 3600 * 1000) {
    return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
  }
  req.admin = session;
  next();
}

module.exports = function(app) {

app.get('/api/discussions', (req, res) => {
  const discussions = readDiscussions();
  const now = new Date();
  // 如果有关键词搜索，只返回匹配的非删除话题
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    const matched = discussions.filter(d => !d.deleted && d.title && d.title.toLowerCase().includes(q));
    return res.json({ ok: true, data: matched.slice(0, 10).map(d => ({ id: d.id, title: d.title })) });
  }
  const active = discussions
    .filter(d => !d.deleted && (!d.expiresAt || parseLocalDateTime(d.expiresAt) > now))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: active });
});

app.post('/api/discussions', (req, res) => {
  // 允许管理员 token (x-admin-token)、学生会 token (x-sc-token) 或 普通用户 token (x-user-token)
  const adminToken = req.headers['x-admin-token'];
  const scToken = req.headers['x-sc-token'];
  const userToken = req.headers['x-user-token'];
  let authed = false;
  let creatorName = null;
  let isUser = false;
  if (adminToken) {
    const session = verifySignedToken(adminToken);
    if (session && session.id && session.loginAt && ['super', 'admin'].includes(session.role) && Date.now() - session.loginAt <= 24 * 3600 * 1000) {
      authed = true;
      creatorName = session.name || session.id;
    }
  } else if (scToken) {
    const session = verifySignedToken(scToken);
    if (session && session.id && session.loginAt && Date.now() - session.loginAt <= 24 * 3600 * 1000) {
      const sc = db.readSC();
      const users = readUsers();
      const isSC = sc && sc.id === session.id;
      const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
      if (isSC || isPublisher) {
        authed = true;
        creatorName = session.name || session.id;
      }
    }
  } else if (userToken) {
    // 普通用户认证
    const session = verifyUserToken(userToken);
    if (session) {
      const users = readUsers();
      const user = users.find(u => u.id === session.id);
      if (user && user.status !== 'banned') {
        // 学生认证检查：仅认证通过的用户可创建话题
        if (user.zhixueStatus !== 'approved' || !user.zhixueReviewedBy) {
          return res.json({ ok: false, msg: '仅学生认证用户可创建话题，请先完成同学认证', code: 'NOT_VERIFIED' });
        }
        // 信用分检测
        if (credibility.isFeatureBlocked(session.id, 'post')) {
          return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
        }

        // 处罚限制检测
        if (isFeatureBlocked(session.id, 'post')) {
          return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
        }
        // 频率限制
        const now = Date.now();
        const timestamps = discussionCreateLimit.get(session.id) || [];
        const recent = timestamps.filter(ts => now - ts < DISCUSSION_CREATE_WINDOW_MS);
        if (recent.length >= DISCUSSION_CREATE_MAX) {
          return res.json({ ok: false, msg: '创建话题过于频繁，请稍后再试', code: 'RATE_LIMITED' });
        }
        discussionCreateLimit.set(session.id, [...recent.slice(-19), now]);
        authed = true;
        creatorName = user.nickname || '匿名';
        isUser = true;
      }
    }
  }
  if (!authed) {
    return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  }

  const { title, expiresAt } = req.body;
  if (!title || !title.trim()) {
    return res.json({ ok: false, msg: '话题标题不能为空' });
  }

  // 普通用户的标题安全检测
  if (isUser) {
    const sensitiveWords = checkSensitive(title);
    if (sensitiveWords.length > 0) {
      return res.json({
        ok: false,
        warning: true,
        warningMsg: '标题包含敏感词，请修改后重试'
      });
    }
    const blockedNames = checkBullyingNames(title);
    if (blockedNames.length > 0) {
      return res.json({
        ok: false,
        bullying: true,
        warningMsg: '标题涉及受保护人员姓名，无法发送'
      });
    }
  }

  const discussions = readDiscussions();

  const newDiscussion = {
    id: uniqueId.generateId('DISC'),
    title: title.trim(),
    expiresAt: expiresAt || null,
    deleted: false,
    createdAt: new Date().toISOString(),
    createdBy: creatorName,
    commentCount: 0,
    ...(isUser ? {} : { official: true })
  };
  discussions.push(newDiscussion);
  writeDiscussions(discussions);
  res.json({ ok: true, data: newDiscussion });
});

app.put('/api/discussions/:id', requireAdmin, (req, res) => {
  const { title, expiresAt } = req.body;
  const discussions = readDiscussions();
  const idx = discussions.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '话题不存在' });

  if (title !== undefined) {
    if (!title.trim()) return res.json({ ok: false, msg: '标题不能为空' });
    discussions[idx].title = title.trim();
  }
  if (expiresAt !== undefined) discussions[idx].expiresAt = expiresAt || null;
  writeDiscussions(discussions);
  res.json({ ok: true, data: discussions[idx] });
});

app.delete('/api/discussions/:id', requireAdmin, (req, res) => {
  let discussions = readDiscussions();
  const d = discussions.find(d => d.id === req.params.id);
  if (!d) return res.json({ ok: false, msg: '话题不存在' });
  if (d.deleted) return res.json({ ok: false, msg: '话题已被删除' });
  saveDeletedItem('discussion', d, 'admin');
  discussions = discussions.filter(x => x.id !== req.params.id);
  writeDiscussions(discussions);

  // 同时物理删除该话题下的所有评论
  let comments = readDiscussionComments();
  comments.forEach(c => {
    if (c.discussionId === req.params.id && !c.deleted) {
      saveDeletedItem('disc_comment', c, 'admin');
    }
  });
  comments = comments.filter(c => c.discussionId !== req.params.id || c.deleted);
  writeDiscussionComments(comments);

  res.json({ ok: true });
});

app.get('/api/discussions/:id/comments', (req, res) => {
  const comments = readDiscussionComments();
  const discussionComments = comments
    .filter(c => c.discussionId === req.params.id && !c.deleted)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 构建嵌套结构
  const topLevel = [];
  const byId = {};
  discussionComments.forEach(c => {
    c.replies = [];
    byId[c.id] = c;
  });
  discussionComments.forEach(c => {
    if (c.parentId && byId[c.parentId]) {
      byId[c.parentId].replies.push(c);
    } else {
      topLevel.push(c);
    }
  });

  res.json({ ok: true, data: topLevel });
});

app.post('/api/discussions/:id/comments', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  // 信用分检测
  if (credibility.isFeatureBlocked(session.id, 'post')) {
    return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
  }

  // 处罚限制检测
  if (isFeatureBlocked(session.id, 'post')) {
    return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
  }

  const { content, parentId } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '评论内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '评论不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
  }
  if (hasSpecialChars(content)) {
    return res.json({ ok: false, msg: '评论包含特殊字符' });
  }
  // 敏感词检测（sensitiveForce=true 时跳过检查，后续仍会生成举报）
  const sensitiveForce = req.body.sensitiveForce === true;
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 有敏感词且用户未确认 → 不保存，返回警告
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '内容包含敏感词，请修改后重试'
    });
  }

  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '内容涉及受保护人员姓名，无法发送'
    });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || user.status === 'banned') {
    return res.json({ ok: false, msg: '账号已被禁用' });
  }

  const discussions = readDiscussions();
  const discussion = discussions.find(d => d.id === req.params.id);
  if (!discussion) return res.json({ ok: false, msg: '话题不存在' });

  const comments = readDiscussionComments();
  const newComment = {
    id: uniqueId.generateId('DICM'),
    discussionId: req.params.id,
    parentId: parentId || null,
    content: content.trim(),
    author: user.nickname || '匿名',
    avatar: user.avatar || '🙈',
    userId: user.id,
    createdAt: new Date().toISOString(),
    likes: 0,
    // ponytail: 去掉 liked/reportCount —— discussion_comments 表无此列，
    // 首条评论写入时 rows[0] 即新评论，INSERT 列含 liked → SqliteError → 500 "网络错误"。
    // liked 为按用户态（应由 likedBy 派生），reportCount 从未被读取，均属死字段。
    hidden: false
  };
  comments.push(newComment);
  writeDiscussionComments(comments);

  // 敏感词命中：自动生成举报记录
  if (hasSensitive) {
    const reports = readReports();
    const ev = { content: newComment.content || '', images: [] };
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      reportId: 'REPO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
      type: 'sensitive_discussion_comment',
      targetId: newComment.id,
      discussionId: req.params.id,
      reason: '系统自动检测：讨论评论包含敏感词',
      reportedBy: session.id,
      reporterName: session.nickname || '未知',
      reportedUserId: session.id,
      evidenceContent: JSON.stringify(ev),
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 同步到校园墙（如果用户勾选了）
  const syncToWall = req.body.syncToWall === true;
  if (syncToWall) {
    const posts = readPosts();
    const topicTitle = discussion.title || '讨论';
    const wallContent = '#' + topicTitle + ' ' + content.trim();
    const postId = uniqueId.generateId('POST');
    posts.unshift({
      id: postId,
      type: '日常',
      content: wallContent,
      discussionId: req.params.id,
      avatar: user.avatar || '🙈',
      author: session.nickname || '匿名',
      userId: session.id,
      time: new Date().toISOString(),
      likes: 0,
      comments: 0,
      commentsCount: 0,
      liked: false,
      rotate: (Math.random() - 0.5) * 8,
      zIndex: Math.floor(Math.random() * 5) + 1,
      images: undefined
    });
    writePosts(posts);
    newComment.syncPostId = postId;
  }

  // 更新话题评论数
  discussion.commentCount = (discussion.commentCount || 0) + 1;
  writeDiscussions(discussions);

  res.json({
    ok: true,
    data: newComment,
    warning: false,
    warningMsg: undefined
  });
});

app.delete('/api/discussions/comments/:id', (req, res) => {
  try {
    // 按 IP 限流，防止批量删除滥用
    const ip = getClientIP(req);
    const now = Date.now();
    const hits = (commentDeleteLimit.get(ip) || []).filter(t => now - t < COMMENT_DELETE_WINDOW_MS);
    if (hits.length >= COMMENT_DELETE_MAX) {
      return res.json({ ok: false, msg: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED' });
    }
    hits.push(now);
    commentDeleteLimit.set(ip, hits);

    const token = req.headers['x-user-token'];
    const adminToken = req.headers['x-admin-token'];

    let isAdmin = false;
    let userId = null;

    if (adminToken) {
      const adminSession = verifySignedToken(adminToken);
      // 仅接受带 role 的管理员 token，且 24 小时内有效；拒绝普通用户 token 冒用提权
      if (adminSession && adminSession.role && adminSession.loginAt && (Date.now() - adminSession.loginAt <= 24 * 3600 * 1000)) {
        isAdmin = true;
      }
    }

    if (token) {
      const session = verifyUserToken(token);
      if (session) userId = session.id;
    }

    if (!isAdmin && !userId) {
      return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    }

    const comments = readDiscussionComments();
    const comment = comments.find(c => c.id === req.params.id);
    if (!comment) return res.json({ ok: false, msg: '评论不存在' });
    if (comment.deleted) return res.json({ ok: false, msg: '评论已被删除' });

    // 检查权限：评论作者、回复作者、管理员
    const isAuthor = userId && comment.userId && userId === comment.userId;
    const isParentAuthor = userId && comment.parentId
      ? (() => { const parent = comments.find(c => c.id === comment.parentId); return parent && parent.userId && parent.userId === userId; })()
      : false;

    if (!isAdmin && !isAuthor && !isParentAuthor) {
      return res.json({ ok: false, msg: '无权删除此评论' });
    }

    const byWho = isAdmin ? 'admin' : 'user';
    // 物理删除该评论及其所有子回复，先保存
    let idsToRemove = [];
    let syncPostIds = [];
    comments.forEach(c => {
      if (c.id === req.params.id || c.parentId === req.params.id) {
        try { saveDeletedItem('disc_comment', c, byWho); } catch(e) { console.warn('[delete] saveDeletedItem failed:', e.message); }
        if (c.syncPostId) syncPostIds.push(c.syncPostId);
        idsToRemove.push(c.id);
      }
    });
    const filtered = comments.filter(c => !idsToRemove.includes(c.id));
    writeDiscussionComments(filtered);

    // 同步删除对应的校园墙帖子
    if (syncPostIds.length > 0) {
      let posts = readPosts();
      syncPostIds.forEach(function(pid) {
        var p = posts.find(function(x) { return x.id === pid; });
        if (p) {
          try { saveDeletedItem('post', p, byWho); } catch(e) { console.warn('[delete] sync post saveDeletedItem failed:', e.message); }
        }
      });
      posts = posts.filter(function(x) { return syncPostIds.indexOf(x.id) === -1; });
      writePosts(posts);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-disc-comment] 500:', e.message, e.stack);
    res.json({ ok: false, msg: '服务器错误: ' + e.message });
  }
});

};
