const { verifyUserToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const { captchaStore, postRateLimit } = require('../lib/state');
const uniqueId = require('../lib/uniqueId');
const db = require('../db');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked } = require('../lib/penalty');
const credibility = require('../lib/credibility');
const maintenance = require('../maintenance');

const CONTENT_MAX_LENGTH = 50;

function readPosts() { return db.readPosts(); }
function writePosts(posts) { db.writePosts(posts); broadcastSSE('postUpdate', { t: Date.now() }); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readReports() { return db.readReports(); }
function writeReports(reports) { db.writeReports(reports); }
function readCreditLogs() { return db.readCreditLogs(); }
function writeCreditLogs(logs) { db.writeCreditLogs(logs); }
function readAdmins() { return db.readAdmins(); }
function readDiscussions() { return db.readDiscussions(); }
function writeDiscussions(discussions) { db.writeDiscussions(discussions); broadcastSSE('discussionUpdate', { t: Date.now() }); }
function readDiscussionComments() { return db.readDiscussionComments(); }
function writeDiscussionComments(comments) { db.writeDiscussionComments(comments); broadcastSSE('discussionUpdate', { t: Date.now() }); }
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

function deleteSyncedDiscComment(postId) {
  try {
    var comments = readDiscussionComments();
    var matched = comments.filter(function(c) { return c.syncPostId === postId; });
    if (matched.length > 0) {
      matched.forEach(function(c) { saveDeletedItem('disc_comment', c, 'system'); });
      comments = comments.filter(function(c) { return c.syncPostId !== postId; });
      writeDiscussionComments(comments);
    }
  } catch(e) { console.warn('[delete] deleteSyncedDiscComment failed:', e.message); }
}

function incUserPostCount(nickname) {
  const users = readUsers();
  const user = users.find(u => u.nickname === nickname);
  if (user) {
    user.postCount = (user.postCount || 0) + 1;
    writeUsers(users);
  }
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

app.get('/api/posts', (req, res) => {
  const posts = readPosts();
  // 过滤已删除的帖子（普通用户不可见）
  let activePosts = posts.filter(p => !p.deleted);
  // 仅自己可见的帖子：仅作者本人可见
  const token = req.headers['x-user-token'];
  let currentUserId = null;
  if (token) {
    const session = verifyUserToken(token);
    if (session) currentUserId = session.id;
  }
  activePosts = activePosts.filter(p => {
    if (p.visibility === 'self_only') {
      return p.userId && currentUserId && p.userId === currentUserId;
    }
    if (p.visibility === 'whitelist') {
      if (p.userId && currentUserId && p.userId === currentUserId) return true;
      if (!currentUserId) return false;
      const vt = Array.isArray(p.visibleTo) ? p.visibleTo : [];
      return vt.includes(currentUserId);
    }
    if (p.visibility === 'blacklist') {
      if (p.userId && currentUserId && p.userId === currentUserId) return true;
      if (!currentUserId) return true;
      const ivt = Array.isArray(p.invisibleTo) ? p.invisibleTo : [];
      return !ivt.includes(currentUserId);
    }
    return true;
  });
  const users = readUsers();
  const admins = readAdmins(); // 用于验证管理员绑定是否仍有效
  // 为每个帖子附加作者的管理员角色信息
  const postsWithAdmin = activePosts.map(p => {
    if (p.userId) {
      const author = users.find(u => u.id === p.userId);
      if (author) {
        // 认证状态校验：approved 必须有审核记录
        let zhixueStatus = author.zhixueStatus || null;
        if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
          zhixueStatus = null;
        }
        // 管理员绑定有效性校验：管理员账号必须仍存在
        let adminRole = null;
        let adminId = null;
        if (author.bindAdminId && author.bindAdminRole) {
          const boundAdmin = admins.find(a => a.id === author.bindAdminId);
          if (boundAdmin) {
            adminRole = author.bindAdminRole;
            adminId = author.bindAdminId;
          }
        }
        return {
          ...p,
          likes: Number(p.likes) || 0,
          likedBy: Array.isArray(p.likedBy) ? p.likedBy : [],
          authorAdminRole: adminRole,
          authorBindAdminId: adminId,
          authorZhixueStatus: zhixueStatus,
          authorZhixueCertType: author.zhixueCertType || null
        };
      }
    }
    return { ...p, likes: Number(p.likes) || 0, likedBy: Array.isArray(p.likedBy) ? p.likedBy : [] };
  });
  res.json({ ok: true, data: postsWithAdmin });
});

app.get('/api/posts/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });
  // 仅自己可见：非作者不可查看
  if (post.visibility === 'self_only') {
    const token = req.headers['x-user-token'];
    let isOwner = false;
    if (token) {
      const session = verifyUserToken(token);
      if (session && post.userId && session.id === post.userId) isOwner = true;
    }
    if (!isOwner) {
      return res.json({ ok: false, msg: '此内容仅自己可见', code: 'SELF_ONLY' });
    }
  }
  // 白名单：非作者且不在 visibleTo 中不可查看
  if (post.visibility === 'whitelist') {
    const token = req.headers['x-user-token'];
    let currentUserId = null;
    let isOwner = false;
    if (token) {
      const session = verifyUserToken(token);
      if (session) {
        currentUserId = session.id;
        if (post.userId && session.id === post.userId) isOwner = true;
      }
    }
    if (!isOwner) {
      const vt = Array.isArray(post.visibleTo) ? post.visibleTo : [];
      if (!currentUserId || !vt.includes(currentUserId)) {
        return res.json({ ok: false, msg: '此内容仅指定用户可见', code: 'WHITELIST_BLOCKED' });
      }
    }
  }
  // 黑名单：在 invisibleTo 中的用户不可查看（作者例外）
  if (post.visibility === 'blacklist') {
    const token = req.headers['x-user-token'];
    let currentUserId = null;
    let isOwner = false;
    if (token) {
      const session = verifyUserToken(token);
      if (session) {
        currentUserId = session.id;
        if (post.userId && session.id === post.userId) isOwner = true;
      }
    }
    if (!isOwner && currentUserId) {
      const ivt = Array.isArray(post.invisibleTo) ? post.invisibleTo : [];
      if (ivt.includes(currentUserId)) {
        return res.json({ ok: false, msg: '此内容对你不可见', code: 'BLACKLIST_BLOCKED' });
      }
    }
  }
  // 过滤已删除的评论
  if (Array.isArray(post.comments)) {
    post.comments = post.comments.filter(c => !c.deleted);
  } else {
    post.comments = [];
  }
  if (post.userId) {
    const users = readUsers();
    const author = users.find(u => u.id === post.userId);
    if (author) {
      let zhixueStatus = author.zhixueStatus || null;
      if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
        zhixueStatus = null;
      }
      return res.json({ ok: true, data: { ...post, authorZhixueStatus: zhixueStatus, authorZhixueCertType: author.zhixueCertType || null } });
    }
  }
  res.json({ ok: true, data: post });
});

app.post('/api/posts', (req, res) => {
  // 验证用户 Token（可选：没 token 以匿名身份发帖，有 token 必须有效）
  let realUserId = null;
  let realAuthor = '匿名';
  let realAvatar = '🙈';
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
    realUserId = session.id;
    realAuthor = session.nickname || '匿名';
    // 从用户数据中获取头像
    const allUsers = readUsers();
    const user = allUsers.find(u => u.id === session.id);
    realAvatar = (user && user.avatar) || '🙈';
  }

  const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit } = req.body;

  // 如果勾选了匿名发布，覆盖为匿名显示
  let anonymousFlag = false;
  if (isAnonymous) {
    realAuthor = '匿名';
    realAvatar = '🙈';
    anonymousFlag = true;
  }

  // 信用分检测
  if (realUserId) {
    const feature = anonymousFlag ? 'anonymous_post' : 'post';
    if (credibility.isFeatureBlocked(realUserId, feature)) {
      return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
    }
  }

  // 处罚限制检测
  if (realUserId) {
    const feature = anonymousFlag ? 'anonymous_post' : 'post';
    if (isFeatureBlocked(realUserId, feature)) {
      return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
    }
  }

  // 匿名发帖配额检测（每天最多2次免费，超出需50credit）
  if (anonymousFlag && realUserId) {
    const today = new Date().toISOString().slice(0, 10);
    const allPosts = readPosts();
    const uid = String(realUserId);
    const todayAnonPosts = allPosts.filter(p => String(p.userId) === uid && p.isAnonymous && p.time && String(p.time).startsWith(today));
    if (todayAnonPosts.length >= 2) {
      if (!payWithCredit) {
        return res.json({ ok: false, code: 'ANON_QUOTA_EXCEEDED', msg: '今日匿名发帖次数已用完（2/2），每次需消耗 50 credit', cost: 50 });
      }
      const users = readUsers();
      const user = users.find(u => u.id === realUserId);
      if (!user || (user.credit || 0) < 50) {
        return res.json({ ok: false, msg: 'credit 不足，无法匿名发帖', code: 'INSUFFICIENT_CREDIT' });
      }
      user.credit = (user.credit || 0) - 50;
      writeUsers(users);
      const logs = readCreditLogs();
      logs.push({
        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: realUserId,
        amount: -50,
        reason: '匿名发帖超额消耗（自然日限制）',
        createdAt: new Date().toISOString()
      });
      writeCreditLogs(logs);
    }
  }

// 发帖频率检测（5分钟内最多3篇，超出需验证码）
if (realUserId) {
  const now = Date.now();
  const timestamps = postRateLimit.get(realUserId) || [];
  const recentPosts = timestamps.filter(ts => now - ts < 300000);
  if (recentPosts.length >= 3 && !maintenance.isBotTesting()) {
    const entry = captchaStore.get(captchaId);
    if (!entry || !entry.verified) {
      return res.json({ ok: false, needCaptcha: true, msg: '发帖频率过高，请先验证' });
    }
    // 验证码通过，清除限制，重新计时
    postRateLimit.delete(realUserId);
    captchaStore.delete(captchaId);
  }
  // 记录本次发帖
  postRateLimit.set(realUserId, [...recentPosts.slice(-19), now]); // 保留最近20条
}
if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '内容不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
  }
  if (!type) {
    return res.json({ ok: false, msg: '请选择类型' });
  }

  // 敏感词检测（sensitiveForce=true 时跳过检查，但后续仍会生成举报）
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

  // 霸凌保护姓名检测（始终阻止，不支持 force 绕过）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '内容涉及受保护人员姓名，无法发送'
    });
  }

  const posts = readPosts();

  // 验证图片（base64 data URL，每张≤2MB，最多4张）
  var validImages = [];
  var maxImageSize = 2 * 1024 * 1024;
  if (Array.isArray(images)) {
    images.forEach(function(img) {
      if (typeof img === 'string' && img.startsWith('data:') && img.length <= maxImageSize && validImages.length < 4) {
        validImages.push(img);
      }
    });
  }

  // 敏感词继续发送：帖子在审核通过前仅自己可见
  const finalVisibility = (hasSensitive && visibility !== 'self_only') ? 'self_only'
    : (visibility === 'self_only' ? 'self_only'
      : (visibility === 'whitelist' ? 'whitelist'
        : (visibility === 'blacklist' ? 'blacklist' : 'public')));
  const finalAllowComments = allowComments !== false;

  const newPost = {
    id: uniqueId.generateId('POST'),
    type,
    content: content.trim(),
    avatar: realAvatar,
    author: realAuthor,
    userId: realUserId,
    time: new Date().toISOString(),
    likes: 0,
    likedBy: [],
    comments: 0,
    commentsCount: 0,
    liked: false,
    rotate: (Math.random() - 0.5) * 8,
    zIndex: Math.floor(Math.random() * 5) + 1,
    images: validImages.length > 0 ? validImages : undefined,
    isAnonymous: anonymousFlag || undefined,
    visibility: finalVisibility,
    allowComments: finalAllowComments,
    visibleTo: finalVisibility === 'whitelist' ? (Array.isArray(visibleTo) ? visibleTo : []) : undefined,
    invisibleTo: finalVisibility === 'blacklist' ? (Array.isArray(invisibleTo) ? invisibleTo : []) : undefined
  };

  posts.unshift(newPost);
  writePosts(posts);

  // 自动话题识别：内容以 # 开头时，提取话题名并关联/创建讨论区
  var finalSyncDiscussionId = req.body.syncDiscussionId;
  if (!finalSyncDiscussionId && content.trim().startsWith('#')) {
    var spaceIdx = content.indexOf(' ');
    var topicName = spaceIdx > 0 ? content.substring(0, spaceIdx) : content.trim();
    if (topicName.length > 1) {
      var _discussions = readDiscussions();
      var _disc = _discussions.find(function(d) { return d.title === topicName && !d.deleted; });
      if (!_disc) {
        _disc = {
          id: uniqueId.generateId('DISC'),
          title: topicName,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          deleted: false,
          createdAt: new Date().toISOString(),
          createdBy: realUserId,
          commentCount: 0
        };
        _discussions.push(_disc);
        writeDiscussions(_discussions);
      }
      finalSyncDiscussionId = _disc.id;
      newPost.discussionId = _disc.id;
      writePosts(posts);
    }
  }

  // 敏感词命中：自动生成举报记录挂到后台
  if (hasSensitive) {
    const reports = readReports();
    const ev = { content: newPost.content || '', images: newPost.images || [] };
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      reportId: 'REPO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
      type: 'sensitive_post',
      targetId: newPost.id,
      postId: newPost.id,
      reason: '系统自动检测：内容包含敏感词',
      reportedBy: realUserId,
      reporterName: realAuthor,
      reportedUserId: realUserId,
      evidenceContent: JSON.stringify(ev),
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 更新注册用户的发贴数
  if (realUserId && realAuthor) {
    incUserPostCount(realAuthor);
  }

  // 通过 syncDiscussionId 自动补全的场景：确保 post.discussionId 已设置
  if (finalSyncDiscussionId && !newPost.discussionId) {
    newPost.discussionId = finalSyncDiscussionId;
    writePosts(posts);
  }

  // 同步到讨论区（如果用户指定了话题或自动识别了话题）
  if (finalSyncDiscussionId && realUserId) {
    var discussions = readDiscussions();
    var disc = discussions.find(function(d) { return d.id === finalSyncDiscussionId; });
    if (disc && !disc.deleted) {
      var discComments = readDiscussionComments();
      var newDiscComment = {
        id: uniqueId.generateId('DICM'),
        discussionId: finalSyncDiscussionId,
        parentId: null,
        content: content.trim(),
        author: realAuthor,
        userId: anonymousFlag ? null : realUserId,
        createdAt: new Date().toISOString(),
        likes: 0,
        liked: false,
        reportCount: 0,
        syncPostId: newPost.id
      };
      discComments.push(newDiscComment);
      writeDiscussionComments(discComments);
      disc.commentCount = (disc.commentCount || 0) + 1;
      writeDiscussions(discussions);
    }
  }

  res.json({
    ok: true,
    data: newPost,
    warning: false,
    warningMsg: undefined
  });
});

app.put('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });

  const { content, pinned } = req.body;
  if (content !== undefined) post.content = content;
  if (pinned !== undefined) post.pinned = pinned;

  writePosts(posts);
  res.json({ ok: true, data: post });
});

app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  let posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });

  saveDeletedItem('post', post, 'admin');
  posts = posts.filter(p => p.id !== req.params.id);
  writePosts(posts);
  deleteSyncedDiscComment(req.params.id);
  res.json({ ok: true });
});

app.post('/api/posts/:id/like', (req, res) => {
  // 获取点赞者身份
  let likerId = getClientIP(req); // 匿名用户用 IP
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) likerId = session.id;
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);

  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }

  // 初始化 likedBy 数组（兼容旧数据）
  if (!Array.isArray(post.likedBy)) post.likedBy = [];

  const idx = post.likedBy.indexOf(likerId);
  if (idx === -1) {
    post.likedBy.push(likerId);
  } else {
    post.likedBy.splice(idx, 1);
  }

  post.likes = post.likedBy.length;
  post.liked = post.likedBy.includes(likerId);

  writePosts(posts);

  res.json({ ok: true, data: { liked: post.liked, likes: post.likes } });
});

// 获取帖子评论列表
app.get('/api/posts/:id/comments', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const comments = (Array.isArray(post.comments) ? post.comments : []).filter(c => !c.deleted);
  res.json({ ok: true, data: comments });
});

app.post('/api/posts/:id/comments', (req, res) => {
  // 验证用户 Token
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录后再评论', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });

  // 信用分检测
  if (credibility.isFeatureBlocked(session.id, 'post')) {
    return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
  }

  // 处罚限制检测
  if (isFeatureBlocked(session.id, 'post')) {
    return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
  }

  // 从 Token 中获取用户信息，禁止从 req.body 读取
  const author = session.nickname || '匿名';
  const userId = session.id;
  // 获取用户头像
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  const avatar = (user && user.avatar) || '🙈';

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '评论内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '评论不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
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

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }
  if (!post.allowComments) {
    return res.json({ ok: false, msg: '本帖不允许评论', code: 'COMMENTS_DISABLED' });
  }
  if (!Array.isArray(post.comments)) post.comments = [];
  const newComment = {
    id: uniqueId.generateId('POCM'),
    content: content.trim(),
    author: author || '匿名',
    avatar: avatar || '🙈',
    userId: userId || null,
    time: new Date().toISOString(),
    likes: 0,
    liked: false
  };
  post.comments.push(newComment);
  post.commentsCount = post.comments.length;

  // 敏感词命中：自动生成举报记录（仅在 sensitiveForce 时执行）
  if (hasSensitive) {
    const reports = readReports();
    const ev = { content: newComment.content || '', images: newComment.images || [] };
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      reportId: 'REPO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
      type: 'sensitive_comment',
      targetId: newComment.id,
      postId: post.id,
      reason: '系统自动检测：评论包含敏感词',
      reportedBy: userId,
      reporterName: author,
      reportedUserId: userId,
      evidenceContent: JSON.stringify(ev),
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  writePosts(posts);
  res.json({
    ok: true,
    data: newComment,
    warning: false,
    warningMsg: undefined
  });
});

app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const userId = req.headers['x-user-token'] ? (() => {
    const s = verifySignedToken(req.headers['x-user-token']);
    return s ? s.id : null;
  })() : null;
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });
  if (comment.deleted) return res.json({ ok: false, msg: '评论已被删除' });
  const isCommentAuthor = userId && comment.userId && userId === comment.userId;
  const isPostAuthor = userId && post.userId && userId === post.userId;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }
  saveDeletedItem('comment', comment, userId === comment.userId ? 'user' : 'post_author');
  post.comments = (Array.isArray(post.comments) ? post.comments : []).filter(c => c.id !== req.params.commentId);
  post.commentsCount = post.comments.length;
  writePosts(posts);
  res.json({ ok: true });
});

// ===== 用户举报帖子 =====
app.post('/api/posts/:id/report', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });

  // 获取举报者信息
  let reporterId = null;
  let reporterName = '匿名用户';
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) {
      reporterId = session.id;
      reporterName = session.nickname || '匿名用户';
    }
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '请选择举报原因' });
  }

  const reports = readReports();
  const ev = { content: post.content || '', images: post.images || [] };
  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    reportId: 'REPO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
    type: 'post',
    targetId: req.params.id,
    postId: req.params.id,
    reason: reason.trim(),
    reportedBy: reporterId,
    reporterName: reporterName,
    reportedUserId: post.userId,
    evidenceContent: JSON.stringify(ev),
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  writeReports(reports);

  // 发送举报成功通知给举报人
  if (reporterId) {
    try {
      const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const notices = readNotices();
      notices.push({
        id: notificationId,
        title: '📋 举报已收到',
        content: '你对帖子(#' + post.id + ')「' + (post.content || '').substring(0, 20) + '...」的举报已提交给管理员审核。\n\n举报原因：' + reason.trim() + '\n\n我们将在核实后进行处理，感谢你对校园环境的维护！',
        author: '系统',
        auto: true,
        level: 'T1',
        createdAt: new Date().toISOString(),
        targetUserId: reporterId
      });
      writeNotices(notices);
      db.addUserNotification({
        notificationId,
        userId: reporterId,
        read: 0,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('发送举报通知失败:', e.message);
    }
  }

  res.json({ ok: true, data: { hidden: false } });
});

// ===== 举报帖子（委托 routes/reports.js 统一入口） =====
app.post('/api/reports', (req, res) => {
  const { postId, reason } = req.body;
  if (!postId) return res.json({ ok: false, msg: '缺少帖子ID' });
  if (!reason || !reason.trim()) return res.json({ ok: false, msg: '请选择举报原因' });

  let reporterId = null, reporterName = '匿名用户';
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) { reporterId = session.id; reporterName = session.nickname || '匿名用户'; }
  }
  try {
    const reportModule = require('./reports');
    const report = reportModule.createReport({ type: 'post', targetId: postId, postId, reason, reporterId, reporterName });
    res.json({ ok: true, data: { reportId: report.reportId } });
  } catch (e) {
    console.error('[posts] 委托举报失败:', e.message);
    res.json({ ok: false, msg: '举报提交失败' });
  }
});

// ===== 举报评论（帖子内的评论） =====
app.post('/api/comments/:id/report', (req, res) => {
  const { postId, reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '请选择举报原因' });
  }

  // 查找评论所在的帖子
  const posts = readPosts();
  let foundComment = null;
  let foundPostId = null;
  for (const p of posts) {
    if (Array.isArray(p.comments)) {
      const c = p.comments.find(c => c.id === req.params.id);
      if (c) {
        foundComment = c;
        foundPostId = p.id;
        break;
      }
    }
  }
  if (!foundComment) return res.json({ ok: false, msg: '评论不存在' });

  // 获取举报者信息
  let reporterId = null;
  let reporterName = '匿名用户';
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) {
      reporterId = session.id;
      reporterName = session.nickname || '匿名用户';
    }
  }

  const reports = readReports();
  const ev = { content: foundComment.content || '', images: foundComment.images || [] };
  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    reportId: 'REPO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
    type: 'comment',
    targetId: req.params.id,
    postId: foundPostId,
    reason: reason.trim(),
    reportedBy: reporterId,
    reporterName: reporterName,
    reportedUserId: foundComment.userId,
    evidenceContent: JSON.stringify(ev),
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  writeReports(reports);

  res.json({ ok: true });
});

};
