const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

// ===== 密码哈希工具（SHA-256 + 随机盐，无需外部依赖）=====
const SALT_LEN = 16;
const ITERATIONS = 100000; // PBKDF2 迭代次数，防暴力

/**
 * 生成密码哈希
 * @param {string} password 明文密码
 * @returns {string} salt:hash 格式的哈希串
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

/**
 * 验证密码
 * @param {string} password 用户输入的明文密码
 * @param {string} storedHash 存储的 salt:hash 串
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const inputHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
}

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

// 中间件
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 全局输入过滤：禁止特殊字符（对 JSON body 和 URL query 生效）
const SPECIAL_CHAR_REGEX = /[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/;
function sanitizeString(val) {
  if (typeof val === 'string') return val.replace(/[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/g, '');
  if (Array.isArray(val)) return val.map(sanitizeString);
  if (val && typeof val === 'object') {
    const cleaned = {};
    for (const k in val) cleaned[k] = sanitizeString(val[k]);
    return cleaned;
  }
  return val;
}
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // 排除 avatar 字段不过滤（base64 包含 +,/,= 等合法字符）
    const { avatar, ...rest } = req.body;
    req.body = { ...sanitizeString(rest), ...(avatar !== undefined ? { avatar } : {}) };
  }
  next();
});

app.use(express.static(__dirname)); // 静态文件服务

// ===== 数据读写 =====
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPosts() {
  try {
    ensureDir();
    if (!fs.existsSync(POSTS_FILE)) {
      fs.writeFileSync(POSTS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取帖子失败:', e);
    return [];
  }
}

function writePosts(posts) {
  try {
    ensureDir();
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入帖子失败:', e);
  }
}

function readAdmins() {
  try {
    ensureDir();
    if (!fs.existsSync(ADMINS_FILE)) {
      return []; // 不自动创建，等待首次设置
    }
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取管理员失败:', e);
    return [];
  }
}

function hasAdmins() {
  return fs.existsSync(ADMINS_FILE) && readAdmins().length > 0;
}

function writeAdmins(admins) {
  try {
    ensureDir();
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入管理员失败:', e);
  }
}

// ===== 管理员认证中间件 =====
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.json({ ok: false, msg: '未登录，请先登录', code: 'NOT_LOGIN' });
  try {
    const session = JSON.parse(Buffer.from(token, 'base64').toString());
    if (!session.id || !session.loginAt) {
      return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
    }
    // token 有效期 24 小时
    if (Date.now() - session.loginAt > 24 * 3600 * 1000) {
      return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
    }
    req.admin = session;
    next();
  } catch {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
}

function requireSuper(req, res, next) {
  if (req.admin.role !== 'super') {
    return res.json({ ok: false, msg: '权限不足，仅超级管理员可用', code: 'FORBIDDEN' });
  }
  next();
}

// 生成 token
function makeToken(admin) {
  return Buffer.from(JSON.stringify({
    id: admin.id,
    name: admin.name,
    role: admin.role,
    loginAt: Date.now()
  })).toString('base64');
}

// ===== 初始化接口 =====

// 检查是否需要初始化（是否存在管理员）
app.get('/api/admin/check-init', (req, res) => {
  res.json({ ok: true, data: { needInit: !hasAdmins() } });
});

// 创建首个管理员（仅在没有任何管理员时可用）
app.post('/api/admin/init', (req, res) => {
  // 如果已有管理员，拒绝初始化
  if (hasAdmins()) {
    return res.json({ ok: false, msg: '系统已初始化，请直接登录', code: 'ALREADY_INIT' });
  }

  const { id, password, name } = req.body;

  // 验证账号格式（3-20位字母、数字、下划线）
  if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '账号格式：3-20位字母、数字、下划线', code: 'INVALID_ID' });
  }

  // 验证密码（至少6位）
  if (!password || password.length < 6) {
    return res.json({ ok: false, msg: '密码至少6位', code: 'INVALID_PWD' });
  }

  // 验证昵称
  if (!name || name.trim().length === 0) {
    return res.json({ ok: false, msg: '请输入管理员昵称', code: 'INVALID_NAME' });
  }

  // 创建首个超级管理员
  const newAdmin = {
    id: id.trim(),
    password: hashPassword(password),
    name: name.trim(),
    role: 'super',
    createdAt: new Date().toISOString()
  };

  writeAdmins([newAdmin]);

  console.log(`✅ 首个管理员已创建: ${id}`);

  res.json({
    ok: true,
    data: {
      token: makeToken(newAdmin),
      id: newAdmin.id,
      name: newAdmin.name,
      role: newAdmin.role
    }
  });
});

// ===== 管理员 API =====

// 登录
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) return res.json({ ok: false, msg: '请输入账号和密码' });

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin || !verifyPassword(password, admin.password)) {
    return res.json({ ok: false, msg: '账号或密码错误' });
  }

  res.json({
    ok: true,
    data: {
      token: makeToken(admin),
      id: admin.id,
      name: admin.name,
      role: admin.role
    }
  });
});

// 修改密码（需输入旧密码确认）
app.post('/api/admin/change-pwd', requireAdmin, (req, res) => {
  const { oldPwd, newPwd } = req.body;
  if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '请填写完整' });
  if (newPwd.length < 6) return res.json({ ok: false, msg: '新密码至少6位' });

  const admins = readAdmins();
  const idx = admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.json({ ok: false, msg: '管理员不存在' });

  // 验证旧密码
  if (!verifyPassword(oldPwd, admins[idx].password)) {
    return res.json({ ok: false, msg: '旧密码错误' });
  }

  // 更新密码
  admins[idx].password = hashPassword(newPwd);
  writeAdmins(admins);

  res.json({ ok: true, msg: '密码修改成功，请重新登录' });
});

// 验证当前登录状态
app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admins = readAdmins();
  const admin = admins.find(a => a.id === req.admin.id);
  if (!admin) return res.json({ ok: false, msg: '管理员不存在', code: 'NOT_FOUND' });
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// 获取管理员列表（仅超级管理员）
app.get('/api/admin/list', requireAdmin, requireSuper, (req, res) => {
  const admins = readAdmins();
  res.json({
    ok: true,
    data: admins.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      createdAt: a.createdAt
    }))
  });
});

// 添加管理员（仅超级管理员）
app.post('/api/admin/add', requireAdmin, requireSuper, (req, res) => {
  const { id, password, name, role } = req.body;
  if (!id || !password || !name) {
    return res.json({ ok: false, msg: '账号、密码、昵称均为必填项' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '账号仅支持 3-20 位字母、数字、下划线' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '密码至少 6 位' });
  }
  if (!['super', 'admin'].includes(role)) {
    return res.json({ ok: false, msg: '角色仅支持 super（最高管理员）或 admin（管理员）' });
  }

  const admins = readAdmins();
  if (admins.find(a => a.id === id)) {
    return res.json({ ok: false, msg: '账号已存在' });
  }

  admins.push({
    id,
    password: hashPassword(password),
    name,
    role,
    createdAt: new Date().toISOString()
  });
  writeAdmins(admins);
  res.json({ ok: true, data: { id, name, role, createdAt: new Date().toISOString() } });
});

// 删除管理员（仅超级管理员，不能删除自己）
app.delete('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  if (id === 'wr1Ench') {
    return res.json({ ok: false, msg: '禁止删除最高管理员账号' });
  }
  if (id === req.admin.id) {
    return res.json({ ok: false, msg: '不能删除自己' });
  }

  let admins = readAdmins();
  const before = admins.length;
  admins = admins.filter(a => a.id !== id);
  if (admins.length === before) {
    return res.json({ ok: false, msg: '管理员不存在' });
  }
  writeAdmins(admins);
  res.json({ ok: true });
});

// 修改管理员信息（仅超级管理员）
app.put('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  const { password, name, role } = req.body;

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin) return res.json({ ok: false, msg: '管理员不存在' });

  if (password !== undefined) {
    if (password.length < 6) return res.json({ ok: false, msg: '密码至少 6 位' });
    admin.password = hashPassword(password);
  }
  if (name !== undefined) admin.name = name;
  if (role !== undefined) {
    if (!['super', 'admin'].includes(role)) return res.json({ ok: false, msg: '角色无效' });
    if (id === 'wr1Ench' && role !== 'super') return res.json({ ok: false, msg: '禁止修改最高管理员角色' });
    admin.role = role;
  }

  writeAdmins(admins);
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// ===== 用户数据读写 =====
function readUsers() {
  try {
    ensureDir();
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取用户失败:', e);
    return [];
  }
}

function writeUsers(users) {
  try {
    ensureDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入用户失败:', e);
  }
}

// 生成用户 token
function makeUserToken(user) {
  return Buffer.from(JSON.stringify({
    id: user.id,
    nickname: user.nickname,
    loginAt: Date.now()
  })).toString('base64');
}

// 验证用户 token
function verifyUserToken(token) {
  try {
    const session = JSON.parse(Buffer.from(token, 'base64').toString());
    if (!session.id || !session.loginAt) return null;
    if (Date.now() - session.loginAt > 7 * 24 * 3600 * 1000) return null; // 7天有效期
    return session;
  } catch {
    return null;
  }
}

// ===== 用户 API =====

// 注册
app.post('/api/user/register', (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password || !nickname) {
    return res.json({ ok: false, msg: '账号、密码、昵称均为必填项' });
  }
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return res.json({ ok: false, msg: '账号需 3-16 位字母、数字、下划线' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '密码至少 6 位' });
  }
  if (nickname.length < 2 || nickname.length > 12) {
    return res.json({ ok: false, msg: '昵称需 2-12 个字符' });
  }

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.json({ ok: false, msg: '账号已被注册' });
  }

  const newUser = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    username,
    password: hashPassword(password),
    nickname,
    avatar: null,
    createdAt: new Date().toISOString(),
    status: 'active',
    postCount: 0
  };
  users.push(newUser);
  writeUsers(users);

  res.json({
    ok: true,
    data: {
      token: makeUserToken(newUser),
      id: newUser.id,
      username: newUser.username,
      nickname: newUser.nickname,
      avatar: newUser.avatar
    }
  });
});

// 登录
app.post('/api/user/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ ok: false, msg: '请输入账号和密码' });

  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.json({ ok: false, msg: '账号或密码错误' });
  }
  if (user.status === 'banned') {
    return res.json({ ok: false, msg: '该账号已被禁用' });
  }

  res.json({
    ok: true,
    data: {
      token: makeUserToken(user),
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar
    }
  });
});

// 验证当前用户登录状态
app.get('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status } });
});

// 更新当前用户资料（昵称、头像）
app.patch('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  const user = users[userIndex];
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });

  const { nickname, avatar } = req.body;
  let updated = false;

  // 更新昵称
  if (nickname !== undefined) {
    if (nickname.length < 2 || nickname.length > 12) {
      return res.json({ ok: false, msg: '昵称需 2-12 个字符' });
    }
    user.nickname = nickname;
    updated = true;
  }

  // 更新头像（base64 data URL）
  if (avatar !== undefined) {
    // 验证头像格式和大小
    if (typeof avatar !== 'string') {
      return res.json({ ok: false, msg: '头像数据格式错误' });
    }
    // 检查是否为 data URL（兼容 jpeg/jpg/jpe 等多种 MIME 变体）
    if (!/^data:image\/jpe?g;base64,/.test(avatar)) {
      return res.json({ ok: false, msg: '头像仅支持 JPG 格式（.jpg）' });
    }
    const base64Data = avatar.split(',')[1];
    if (!base64Data) {
      return res.json({ ok: false, msg: '头像数据不完整' });
    }
    // 计算 base64 数据大小（约等于原文件的 4/3）
    if (base64Data.length > 700000) { // 对应约 500KB 的 JPG 文件
      return res.json({ ok: false, msg: '头像图片太大，请压缩到 500KB 以内' });
    }
    // 可选：验证 base64 有效性
    try {
      Buffer.from(base64Data, 'base64');
    } catch (e) {
      return res.json({ ok: false, msg: '头像数据格式无效' });
    }
    user.avatar = avatar;
    updated = true;
  }

  if (!updated) {
    return res.json({ ok: false, msg: '未提供可更新的字段' });
  }

  users[userIndex] = user;
  writeUsers(users);
  res.json({ ok: true, data: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
});

// 获取指定用户公开信息（通过用户ID）
app.get('/api/users/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  // 不返回密码等敏感信息
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status } });
});

// 获取指定用户发布的帖子
app.get('/api/users/:id/posts', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  const posts = readPosts();
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname);
  res.json({ ok: true, data: userPosts });
});

// 获取用户列表（仅管理员）
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers();
  const posts = readPosts();
  const list = users.map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar,
    createdAt: u.createdAt,
    status: u.status,
    postCount: posts.filter(p => p.author === u.nickname || p.userId === u.id).length
  }));
  res.json({ ok: true, data: list });
});

// 封禁/解封用户（仅管理员）
app.put('/api/admin/user/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['active', 'banned'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  user.status = status;
  writeUsers(users);
  res.json({ ok: true });
});

// 删除用户（仅管理员）—— 同时删除该用户的所有帖子
app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  let users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 先删除该用户的所有帖子
  let posts = readPosts();
  const userNickname = user.nickname;
  const beforePostCount = posts.length;
  posts = posts.filter(p => p.userId !== userId && p.author !== userNickname);
  const deletedPostCount = beforePostCount - posts.length;
  writePosts(posts);

  // 再删除用户
  users = users.filter(u => u.id !== userId);
  writeUsers(users);

  res.json({ ok: true, deletedPosts: deletedPostCount });
});

// 重置用户密码（仅管理员）—— 生成随机密码返回给管理员
app.post('/api/admin/user/:id/reset-password', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 生成 8 位随机密码
  const newPassword = Math.random().toString(36).slice(2, 10);
  user.password = hashPassword(newPassword);
  writeUsers(users);

  res.json({ ok: true, data: { password: newPassword } });
});

// 发帖时更新用户 postCount
function incUserPostCount(nickname) {
  const users = readUsers();
  const user = users.find(u => u.nickname === nickname);
  if (user) {
    user.postCount = (user.postCount || 0) + 1;
    writeUsers(users);
  }
}

// 获取所有帖子
app.get('/api/posts', (req, res) => {
  const posts = readPosts();
  res.json({ ok: true, data: posts });
});

// 获取单个帖子（用于详情页）
app.get('/api/posts/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  res.json({ ok: true, data: post });
});

// 发布新帖子
app.post('/api/posts', (req, res) => {
  const { type, content, avatar, author, userId } = req.body;

  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '内容不能为空' });
  }
  if (!type) {
    return res.json({ ok: false, msg: '请选择类型' });
  }

  const posts = readPosts();

  const newPost = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    content: content.trim(),
    avatar: avatar || '🙈',
    author: author || '匿名',
    userId: userId || null,
    time: new Date().toISOString(),
    likes: 0,
    comments: 0,
    commentsCount: 0,
    liked: false,
    rotate: (Math.random() - 0.5) * 8,
    zIndex: Math.floor(Math.random() * 5) + 1
  };

  posts.unshift(newPost);
  writePosts(posts);

  // 更新注册用户的发贴数
  if (userId && author) {
    incUserPostCount(author);
  }

  res.json({ ok: true, data: newPost });
});

// 点赞 / 取消点赞
app.post('/api/posts/:id/like', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);

  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }

  post.liked = !post.liked;
  post.likes += post.liked ? 1 : -1;
  post.likes = Math.max(0, post.likes);

  writePosts(posts);

  res.json({ ok: true, data: { liked: post.liked, likes: post.likes } });
});

// 获取帖子评论
app.get('/api/posts/:id/comments', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }
  const comments = post.comments || [];
  res.json({ ok: true, data: comments });
});

// 发表评论
app.post('/api/posts/:id/comments', (req, res) => {
  const { content, author, avatar, userId } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '评论内容不能为空' });
  }
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }
  if (!post.comments) post.comments = [];
  const newComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
  writePosts(posts);
  res.json({ ok: true, data: newComment });
});

// 评论点赞
app.post('/api/posts/:postId/comments/:commentId/like', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });
  comment.liked = !comment.liked;
  comment.likes = (comment.likes || 0) + (comment.liked ? 1 : -1);
  comment.likes = Math.max(0, comment.likes);
  writePosts(posts);
  res.json({ ok: true, data: { liked: comment.liked, likes: comment.likes } });
});

// 删除评论（评论作者或帖子作者可删）
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const userId = req.headers['x-user-token'] ? (() => {
    try { return JSON.parse(Buffer.from(req.headers['x-user-token'].split('.')[1], 'base64').toString()).id; } catch { return null; }
  })() : null;
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const idx = (post.comments || []).findIndex(c => c.id === req.params.commentId);
  if (idx === -1) return res.json({ ok: false, msg: '评论不存在' });
  const comment = post.comments[idx];
  const isCommentAuthor = userId && comment.userId && userId === comment.userId;
  const isPostAuthor = userId && post.userId && userId === post.userId;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }
  post.comments.splice(idx, 1);
  post.commentsCount = post.comments.length;
  writePosts(posts);
  res.json({ ok: true });
});

// 举报评论
app.post('/api/comments/:commentId/report', (req, res) => {
  const { postId, reason } = req.body;
  if (!reason) return res.json({ ok: false, msg: '请填写举报原因' });
  const reports = readReports();
  // 去重
  const existing = reports.find(r => r.targetId === req.params.commentId && r.type === 'comment');
  if (existing) return res.json({ ok: false, msg: '已举报过此评论' });
  reports.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'comment',
    targetId: req.params.commentId,
    postId: postId,
    reason,
    status: 'pending',
    time: new Date().toISOString()
  });
  writeReports(reports);
  res.json({ ok: true });
});

// 批量删除评论（管理后台）
app.delete('/api/admin/comments/:commentId', requireAdmin, (req, res) => {
  const posts = readPosts();
  let found = false;
  posts.forEach(post => {
    const idx = (post.comments || []).findIndex(c => c.id === req.params.commentId);
    if (idx !== -1) {
      post.comments.splice(idx, 1);
      post.commentsCount = post.comments.length;
      found = true;
    }
  });
  if (!found) return res.json({ ok: false, msg: '评论不存在' });
  writePosts(posts);
  // 同时删除该评论的举报记录
  const reports = readReports();
  const remaining = reports.filter(r => r.targetId !== req.params.commentId || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true });
});

app.post('/api/comments/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: false, msg: '请提供要删除的评论 ID 列表' });
  const posts = readPosts();
  let deletedCount = 0;
  posts.forEach(post => {
    const before = post.comments ? post.comments.length : 0;
    if (post.comments) {
      post.comments = post.comments.filter(c => !ids.includes(c.id));
      post.commentsCount = post.comments.length;
      deletedCount += before - post.comments.length;
    }
  });
  writePosts(posts);
  // 同时删除相关的举报记录
  const reports = readReports();
  const remainingReports = reports.filter(r => !ids.includes(r.targetId) || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true, deleted: deletedCount });
});

// 批量删除帖子
app.post('/api/posts/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请提供要删除的帖子 ID 列表' });
  }
  let posts = readPosts();
  const before = posts.length;
  posts = posts.filter(p => !ids.includes(p.id));
  writePosts(posts);
  res.json({ ok: true, deleted: before - posts.length });
});

// 删除帖子（仅管理员）
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  let posts = readPosts();
  const before = posts.length;
  posts = posts.filter(p => p.id !== req.params.id);

  if (posts.length === before) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }

  writePosts(posts);
  res.json({ ok: true });
});

// 用户删除自己发的帖子
app.delete('/api/user/posts/:id', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.userId !== session.id) return res.json({ ok: false, msg: '无权删除他人的帖子' });

  const updated = posts.filter(p => p.id !== req.params.id);
  writePosts(updated);
  res.json({ ok: true });
});

// 修改帖子（置顶/修改内容）
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

// 统计数据
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const posts = readPosts();
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const oneWeekAgo = now - 604800000;

  const stats = {
    total: posts.length,
    today: posts.filter(p => new Date(p.time).getTime() >= oneDayAgo).length,
    week: posts.filter(p => new Date(p.time).getTime() >= oneWeekAgo).length,
    totalLikes: posts.reduce((sum, p) => sum + (p.likes || 0), 0),
    byType: {}
  };

  ['日常', '表白', '树洞', '失物招领', '活动'].forEach(t => {
    stats.byType[t] = posts.filter(p => p.type === t).length;
  });

  stats.dailyChart = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    stats.dailyChart.push({
      label: i === 0 ? '今天' : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: posts.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length
    });
  }

  res.json({ ok: true, data: stats });
});

// ===== 举报数据读写 =====
function readReports() {
  try {
    ensureDir();
    if (!fs.existsSync(REPORTS_FILE)) {
      fs.writeFileSync(REPORTS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取举报数据失败:', e);
    return [];
  }
}

function writeReports(reports) {
  try {
    ensureDir();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入举报数据失败:', e);
  }
}

// ===== 举报 API =====

// 提交举报（任意用户，需登录 token）
app.post('/api/posts/:id/report', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '请填写举报原因' });
  }

  const postId = req.params.id;
  const posts = readPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });

  const reports = readReports();

  // 检查该用户是否已举报过此帖（字段名是 reportedBy，不是 userId）
  const alreadyReported = reports.some(
    r => r.postId === postId && r.reportedBy === session.id
  );
  if (alreadyReported) {
    return res.json({ ok: false, msg: '您已经举报过这条帖子了' });
  }

  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    postId,
    postContent: (post.content || '').slice(0, 100),
    postAuthor: post.author || '匿名',
    reportedBy: session.id,
    reporterName: session.nickname || '未知',
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending' // pending / resolved / ignored
  });

  writeReports(reports);

  // 更新帖子的举报计数
  post.reportCount = (post.reportCount || 0) + 1;
  // 举报数 > 20 自动隐藏
  if (post.reportCount > 20) {
    post.hidden = true;
  }
  writePosts(posts);

  res.json({ ok: true, data: { reportCount: post.reportCount, hidden: !!post.hidden } });
});

// 获取举报列表（仅管理员，支持 status 筛选）
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const reports = readReports();
  const { status } = req.query;
  const filtered = status ? reports.filter(r => r.status === status) : reports;

  // 按状态排序：pending 优先，再按时间倒序
  filtered.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ ok: true, data: filtered });
});

// 获取所有评论（供管理后台）
app.get('/api/admin/comments', requireAdmin, (req, res) => {
  const posts = readPosts();
  const allComments = [];
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      allComments.push({
        ...c,
        postId: post.id,
        postAuthor: post.author,
        postContent: post.content.slice(0, 50)
      });
    });
  });
  allComments.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ ok: true, data: allComments });
});

// 处理举报（标记 resolved / ignored，仅管理员）
app.put('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status, action } = req.body;
  if (!['resolved', 'ignored'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }

  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });

  report.status = status;
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  if (action) report.action = action;

  // 如果 action 是 delete_post，同时删除被举报的帖子
  if (action === 'delete_post' && report.postId) {
    let posts = readPosts();
    posts = posts.filter(p => p.id !== report.postId);
    writePosts(posts);
  }
  // 如果 action 是 delete_comment，同时删除被举报的评论
  if (action === 'delete_comment' && report.targetId && report.type === 'comment') {
    let posts = readPosts();
    posts.forEach(post => {
      if (post.comments) {
        post.comments = post.comments.filter(c => c.id !== report.targetId);
        post.commentsCount = post.comments.length;
      }
    });
    writePosts(posts);
  }

  writeReports(reports);
  res.json({ ok: true });
});

// ===== 启动 =====
app.listen(PORT, () => {
  console.log(`\n  📌 校园墙服务已启动`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/admin.html`);
  console.log(`\n  🔐 超级管理员账号: wr1Ench / cai091226\n`);
});
