const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// ===== 加载 .env 文件 =====
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
  console.log('[env] 已加载 .env 文件');
}

// ===== 读取本地 git 版本号 =====
let cachedGitSha = 'dev';
let cachedCommitMsg = '';
try {
  const { execSync } = require('child_process');
  const sha = execSync('git rev-parse --short=7 HEAD', { cwd: __dirname, timeout: 5000 }).toString().trim();
  const msg = execSync('git log -1 --pretty=%s', { cwd: __dirname, timeout: 5000 }).toString().trim();
  if (sha) cachedGitSha = sha;
  if (msg) cachedCommitMsg = msg;
} catch (e) {
  cachedGitSha = 'dev';
}

// ===== 崩溃保护 =====
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] Unhandled Rejection:', reason);
});

// 智学网自动登录模块
let loginZhixue = null;
try {
  const zhixueModule = require('./zhixue');
  loginZhixue = zhixueModule.loginZhixue;
  console.log('[zhixue] 智学网模块加载成功');
} catch (e) {
  console.warn('[zhixue] 智学网模块未加载:', e.message);
}

// ===== 创建 Express 应用 =====
const app = express();
app.set('trust proxy', true);
const PORT = 3000;

// ===== 中间件 =====
const { inputSanitize, createCheckMaintenance } = require('./lib/middleware');
const { verifySignedToken } = require('./lib/crypto');
const db = require('./db');
const maintenance = require('./maintenance');

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024
}));
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(inputSanitize);
app.use(createCheckMaintenance(
  () => maintenance.read(),
  (data) => maintenance.write(data),
  verifySignedToken
));

// ===== SPA 页面模板路由（放在静态文件之前） =====
const PAGE_MAP = {
  '/': 'pages/wall.html',
  '/admin.html': 'pages/admin.html',
  '/user.html': 'pages/user.html',
  '/post.html': 'pages/post.html',
  '/notice.html': 'pages/notice.html',
  '/report.html': 'pages/report.html',
  '/bully.html': 'pages/bully.html',
  '/knowledge.html': 'pages/knowledge.html',
  '/ecosystem.html': 'pages/ecosystem.html',
};

app.use((req, res, next) => {
  if (req.method === 'GET' && req.headers['x-spa-request'] === '1') {
    const pageFile = PAGE_MAP[req.path];
    if (pageFile) {
      return res.sendFile(path.join(__dirname, pageFile));
    }
  }
  next();
});

app.use(express.static(__dirname));

// ===== SSE 实时推送 =====
const { sseClients } = require('./lib/sse');

// ===== 挂载路由模块 =====
require('./routes/auth')(app);
require('./routes/admin')(app);
require('./routes/user')(app);
require('./routes/posts')(app);
require('./routes/discussions')(app);
require('./routes/qa')(app);
require('./routes/votes')(app);
require('./routes/notices')(app);
require('./routes/pickup')(app);
require('./routes/student-council')(app);
require('./routes/maintenance')(app);
require('./routes/system')(app, { sseClients, cachedGitSha, cachedCommitMsg });

// ===== 启动 =====
app.listen(PORT, () => {
  console.log(`\n  📌 校园墙服务已启动`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/admin.html`);
});
