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
const { ensureUniqueIds } = require('./lib/idMigration');

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

// ===== 桌面端强制移动端 UI：iframe 设备框 =====
// 桌面浏览器忽略 viewport meta，无法靠改 meta 触发移动端媒体查询。
// 因此对桌面 UA 的前台整页 HTML 请求返回一个 768px 宽的 iframe 外壳，
// iframe 内以 ?mf=1 加载真实页面 —— iframe 视口宽度=768，媒体查询与 vw 均按移动端渲染。
const FRAME_PAGES = new Set([
  '/', '/index.html', '/post.html', '/user.html', '/notice.html',
  '/report.html', '/bully.html', '/knowledge.html', '/ecosystem.html',
  '/agreement.html', '/apply-notice.html', '/credit.html',
  '/featured.html', '/launch.html', '/maintenance.html',
]);
const MOBILE_UA = /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile|Mobile/i;

app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    req.headers['x-spa-request'] !== '1' &&
    !/[?&]mf=1(?:&|$)/.test(req.originalUrl) &&
    FRAME_PAGES.has(req.path) &&
    !MOBILE_UA.test(req.headers['user-agent'] || '')
  ) {
    const sep = req.originalUrl.includes('?') ? '&' : '?';
    let target = req.originalUrl + sep + 'mf=1';
    // 仅允许同源安全字符，杜绝反射型 XSS（CodeQL: 用户可控值直接写入 iframe src）
    if (!/^\/[A-Za-z0-9_./?&=%+-]*$/.test(target)) {
      target = '/?mf=1';
    }
    target = encodeURI(target);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>校园墙</title>' +
      '<style>html,body{margin:0;height:100%;background:#e8e6e1;}' +
      'body{display:flex;justify-content:center;}' +
      'iframe{width:768px;max-width:100%;height:100%;border:0;background:#fff;' +
      'box-shadow:0 0 24px rgba(0,0,0,0.12);}</style></head>' +
      '<body><iframe src="' + target + '" allow="clipboard-write; fullscreen"></iframe></body></html>'
    );
  }
  next();
});

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
// ponytail: admin.js（含 /api/admin/votes/:id 等特化路由）必须在 auth.js（含 /api/admin/:id 通用路由）之前挂载，
// 否则 PUT/DELETE /api/admin/votes/:id 会被通用路由捕获，返回"管理员不存在"。
require('./routes/admin')(app);
require('./routes/auth')(app);
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
// 数据唯一化：启动时迁移旧 ID
try {
  const migrationResult = ensureUniqueIds(require('./db'));
  console.log('[数据唯一化] 迁移完成:', migrationResult);
} catch (err) {
  console.error('[数据唯一化] 迁移失败:', err.message);
}

app.listen(PORT, () => {
  console.log(`\n  📌 校园墙服务已启动`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/admin.html`);
});
