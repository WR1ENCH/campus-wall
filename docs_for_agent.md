# agent-dev — Campus Wall 开发文档（AI Agent 上手指南）

> 本文件是给 AI Agent 使用的「项目全景图」。阅读它即可直接上手编辑本项目，无需再逐一检索代码。
> 所有结论均来自对当前代码库（codegraph 索引 784 节点 / 2090 边）的实查，与 README.md 中部分已过时描述（如「JSON 文件存储」「svg-captcha」）不同，本文件以**实际代码**为准。
> 请查看目录下的graphify图谱来完善你对此项目的理解，每当对此项目进行改动，请主动检查是否要对garphity图谱更新

## 仓库地址

- GitHub: https://github.com/WR1ENCH/campus-wall
- Gitee: https://gitee.com/wr1Ench/campus-wall

---

## 0. 一句话定位

一个中学校园匿名留言板系统（校园墙）。后端 Node.js + Express，数据用 SQLite（better-sqlite3），前端是**原生 HTML/CSS/JS 的 SPA**。包含：发帖/点赞/评论、讨论区、QA 悬赏问答、投票、校园通知、失物/捡漏拍卖、霸凌举报、反馈、举报处理、实名（智学网）认证、积分（Credit）体系、维护模式、SSE 实时推送、微信小程序端。

---

## 1. 技术栈与依赖

| 分类 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js ≥ 18 | `package.json` 中无 engines 限制，但代码用到现代语法 |
| 后端 | Express ^4.22 | 所有路由用 `app.get/post/...` 直接挂载（**没有** express-router 子实例） |
| 数据库 | better-sqlite3 ^11 | 同步 SQLite，WAL 模式，文件 `data/campus.db` |
| 验证码 | slider-captcha ^1.0 | 滑块验证码，前端 `slider-captcha/longbow.slidercaptcha.min.js` |
| 其它 | compression, cookie-parser, cors | 中间件 |
| 前端 | 原生 HTML/CSS/JS（无构建步骤） | SPA 用 `spa.js` 自己实现的轻量路由 |
| 加密 | Node 内置 `crypto` | PBKDF2 密码哈希、AES-256-CBC 实名加密、HMAC-SHA256 Token 签名 |
| 小程序 | 微信原生小程序 | `campus-wall-miniprogram/` 独立目录 |

**启动命令**：`npm install` → `npm start`（即 `node server.js`）。监听端口 `PORT`（默认 3000）。

---

## 2. 项目文件结构

```
campus-wall/
├── server.js                     # 入口：Express 应用、中间件、SPA 路由、挂载所有 routes 模块
├── db.js                         # 数据层：SQLite 连接 + 自动迁移 + readXxx/writeXxx 接口
├── maintenance.js                # 维护模式模块（测试密钥生成/校验）
├── zhixue.js                     # 智学网自动登录模块（可选，加载失败不致命）
├── sensitiveWords.js             # 敏感词库加载（含 tencent_sensitive_words.enc 解密）
├── crypto_words.js / bullyingNames.js  # 加密词库 / 霸凌名称库
├── spa.js                        # 前端 SPA 无刷新路由（class SpaRouter）
├── *.html                        # 前端页面（index.html 是主壳，其余是完整独立页 + SPA 片段）
├── pages/                        # SPA 页面片段（wall/user/post/notice/report/bully/knowledge/ecosystem/admin）
├── assets/                       # 截图等静态资源
├── lib/                          # 后端公共模块
│   ├── crypto.js                 # 密码哈希/Token 签名/实名 AES 加密
│   ├── middleware.js             # requireAdmin/requireSuper/inputSanitize/createCheckMaintenance/限流
│   ├── state.js                  # 内存 Map 状态（验证码、限流、在线用户等）
│   ├── sse.js                    # SSE 实时推送（broadcastSSE）
│   ├── cache.js                  # 极简缓存（get/set）
│   ├── helpers.js                # getClientIP 等工具
│   └── hotness.js                # 帖子热度计算
├── routes/                       # 后端 API 模块（每个文件 module.exports = function(app){...}）
│   ├── admin.js                  # 后台管理（最大，152 符号）
│   ├── auth.js                   # 管理员初始化/登录/改密/列表
│   ├── user.js                   # 用户注册/登录/资料/认证/积分/扫码
│   ├── posts.js                  # 帖子/评论/点赞/举报
│   ├── discussions.js            # 讨论区
│   ├── qa.js                     # QA 悬赏问答
│   ├── votes.js                  # 投票
│   ├── notices.js                # 校园通知 + 公告
│   ├── pickup.js                 # 失物/捡漏拍卖
│   ├── student-council.js        # 学生会登录
│   ├── maintenance.js            # 维护模式公开接口
│   └── system.js                 # 版本/统计/心跳/霸凌举报/SSE 流
├── campus-wall-miniprogram/      # 微信小程序端（独立项目）
└── data/                         # 运行时生成（.gitignore 忽略）：campus.db 等
```

> 注意：根目录的 `index.html / admin.html / post.html / user.html / notice.html / report.html / bully.html / knowledge.html / ecosystem.html` 既是**完整独立可访问的页面**，也通过 `pages/*.html` 提供 SPA 片段。SPA 内部导航时带 `X-SPA-Request: 1` 头，server.js 会只返回 `pages/` 下的片段。

---

## 3. 后端架构

### 3.1 请求生命周期（server.js）

1. 加载 `.env`（手动解析，仅填充未设置的 `process.env`）。
2. 读取 git 短哈希作为版本号（`cachedGitSha` / `cachedCommitMsg`）。
3. 注册崩溃保护（`uncaughtException` / `unhandledRejection`）。
4. 尝试加载 `zhixue.js`（失败仅 warn，不致命）。
5. 中间件顺序（**顺序敏感，不要乱调**）：
   - `compression()`（阈值 1024，可被 `x-no-compression` 头关闭）
   - `cors()`（**全开**，无白名单）
   - `cookieParser()`
   - `express.json({ limit: '50mb' })`
   - `inputSanitize`（`lib/middleware.js`）— 全局特殊字符过滤
   - `createCheckMaintenance(...)` — 维护模式闸门
6. **桌面端强制移动端 UI（iframe 设备框）**：在维护闸门之后、SPA 片段中间件之前，插入一个中间件 `FRAME_PAGES` + `MOBILE_UA` 判断：
   - 对**桌面 UA** 且**非 SPA 片段**且**未带 `?mf=1`** 的前台整页 HTML 请求（`/`、`/index.html`、`/post.html`、`/user.html`、`/notice.html`、`/report.html`、`/bully.html`、`/knowledge.html`、`/ecosystem.html`、`/agreement.html`、`/apply-notice.html`、`/credit.html`、`/featured.html`、`/launch.html`、`/maintenance.html`，**不含 `admin.html`**），直接返回一段外壳 HTML：一个居中、宽 `768px` 的 `<iframe>`，其 `src` 指向原 URL 加 `?mf=1`。
   - iframe 内部视口宽度为 768px，因此 `@media (max-width:768px)` 与 `vw` 单位全部按移动端渲染，**真实手机（命中 `MOBILE_UA`）不套框、直接原生渲染**。
   - 桌面浏览器会**忽略** `<meta name="viewport">`，故单纯改 viewport 无法触发移动端布局；iframe 框是本项目的唯一生效方案。
7. SPA 片段中间件：仅当 `GET` 且 `X-SPA-Request: 1` 时，按 `PAGE_MAP` 返回 `pages/*.html` 片段。
8. `express.static(__dirname)` — 静态文件（含根目录完整 html 页）。
9. 挂载 13 个 routes 模块（**顺序有强约束，见 3.4**）。
10. `app.listen(PORT)`。

### 3.2 认证与 Token（`lib/crypto.js`）

Token 格式：`base64(JSON payload) + '.' + base64(HMAC-SHA256(payload, TOKEN_SECRET))`。
- `signToken(payload)` / `verifySignedToken(token)` — 通用签名与校验（兼容「无签名旧 token」）。
- `makeToken(admin)` → `{id, name, role, loginAt}`，`makeUserToken(user)` → `{id, nickname, loginAt}`。
- `verifyUserToken(token)` — 用户 token，7 天过期（管理员侧 24 小时由 middleware 强制）。
- `hashPassword` / `verifyPassword` — PBKDF2-SHA512，100000 次迭代 + 随机盐（`salt:hash` 存储）。
- `encryptCert` / `decryptCert` — AES-256-CBC 加密实名信息，`CERT_ENC_SECRET` 派生密钥，**未配置会随机生成并在重启后无法解密**（启动会打印 SECURITY 警告）。

**三种身份令牌头**：

| 身份 | 请求头 | 中间件 | 有效期 |
|------|--------|--------|--------|
| 用户 | `x-user-token` | 路由内 `verifyUserToken(req.headers['x-user-token'])` | 7 天 |
| 管理员 | `x-admin-token` | `requireAdmin` | 24 小时 |
| 学生会 | `x-sc-token` | 路由内自行校验 | — |

`requireAdmin(req,res,next)`：读 `x-admin-token` → `verifySignedToken` → 24h 过期校验 → `req.admin = session`。
`requireSuper`：在 `requireAdmin` 之后调用，检查 `req.admin.role === 'super'`。
**超级管理员账号 `wr1Ench` 受保护**：禁止删除、禁止降权、禁止改角色为非 super。

### 3.3 输入过滤（`inputSanitize`，lib/middleware.js）

全局对 `req.body` 做特殊字符清理（正则 `[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?]` 等替换为空）。
**白名单字段不过滤**（保留原始内容，因为它们是用户可见文本/媒体）：`avatar, manualImages, manualEmail, images, content, title, text, body, reason, answer, question, description, options`。
→ 改动发帖/评论逻辑时，若新增需要保留特殊字符的字段，必须加入此白名单，否则会被静默清空。

### 3.4 路由挂载顺序（关键约束）

server.js 中挂载顺序：

```
admin → auth → user → posts → discussions → qa → votes → notices
→ pickup → student-council → maintenance → system
```

**重要**：`routes/admin.js` 必须在 `routes/auth.js` **之前**挂载。原因：`admin.js` 注册了特化路由 `/api/admin/votes/:id`（及类似），而 `auth.js` 注册了通用路由 `/api/admin/:id`。若顺序相反，`PUT/DELETE /api/admin/votes/:id` 会被通用 `/api/admin/:id` 捕获，返回「管理员不存在」。改动挂载顺序前务必理解此冲突。

### 3.5 内存状态（`lib/state.js`）

全部是进程内 `Map`，**重启即丢失**（非持久化）：
- `captchaStore` — 滑块验证码会话（5 分钟 TTL）
- `postRateLimit` — 发帖频率限制（5 分钟最多 3 帖）
- `qrCodeStore` — 扫码登录会话
- `redeemRateLimit` / `cardCreateLimits` — 积分兑换/卡密生成限流
- `onlineUsers` — 在线用户心跳时间戳
- `loginFailures` — 登录暴破限流（`ip|account` → 失败时间戳数组，15 分钟窗口，最多 10 次，超了 429）

### 3.6 SSE 实时推送（`lib/sse.js`）

`broadcastSSE(eventName, payload)` 向所有已连接 SSE 客户端（`sseClients` Set）推送。每 15 秒发一次 `ping` 保活。
- 客户端通过 `GET /api/stream` 建立连接（见 routes/system.js）。
- 帖子/通知写入后会广播 `postUpdate` / `noticeUpdate` 事件（在 routes 的 writeXxx 包装函数里调用 `broadcastSSE`）。

### 3.7 维护模式

`createCheckMaintenance(readFn, writeFn, verifySignedToken)` 是全局闸门：
- `/api/admin*`、`/admin.html`、`/maintenance.html`、`/api/maintenance*`、`/api/slider-captcha/grant` **永远放行**。
- 维护开启时：HTML 请求重定向到 `/maintenance.html`；API 请求返回 `{ok:false, code:'MAINTENANCE'}`。
- 放行例外：管理员 token（24h）、维护 bypass cookie（`maintenance_bypass`，4h）、来自 `/admin.html` 的 referer、以及 `noticeBypass` 模式下的通知/讨论/投票/公告/学生会相关路径。
- 支持 `autoStart`/`autoEnd` 定时自动开关。
- 测试密钥（`TW-xxxxxxxx`）由 `maintenance.js` 管理，24h 有效，经 `/api/maintenance/verify` 验证后签发 `maintenance_bypass` token。

### 3.8 数据唯一化（`lib/uniqueId.js` + `lib/idMigration.js`）

所有核心实体使用带前缀的唯一 ID，确保跨模块全局唯一。

**前缀方案**（格式：`PREFIX-[A-Z0-9]{16}`）：

| 前缀 | 含义 | 生成时机 |
|------|------|----------|
| `POST` | 帖子 | `routes/posts.js` 创建帖子 |
| `POCM` | 帖子评论 | `routes/posts.js` 创建评论 |
| `DISC` | 讨论主题 | `routes/discussions.js` 创建讨论 |
| `DICM` | 讨论评论 | `routes/discussions.js` 创建评论 |
| `QAQU` | QA 问题 | `routes/qa.js` 创建问题 |
| `QAAN` | QA 回答 | `routes/qa.js` 创建回答 |
| `VOTE` | 投票 | `routes/votes.js` 创建投票 |
| `AURQ` | 代拿请求 | `routes/pickup.js` 创建代拿 |
| `CRDL` | 信用分日志 | `lib/credibility.js` 信用分变动 |
| (无前缀) | 用户 uid | 16 位随机数字 `0-9` |

**核心 API**：
- `generateId(prefix)` — 返回 `PREFIX-[A-Z0-9]{16}` 字符串
- `generateUID()` — 返回 16 位随机数字字符串
- `isValidIdFormat(id)` — 校验新格式 ID 或 16 位 UID
- `logIdAssignment(entityType, entityId, content, db)` — 写入 `data/ID_input.log` + `ID_input` 表

**启动迁移**：`server.js` 启动时调用 `ensureUniqueIds(db)`，将旧格式 ID（`Date.now().toString(36)+random`）升级为新前缀格式，在事务中执行，幂等安全。

**ID 日志表**：`ID_input`（entityType, entityId, content, assignedAt），记录每次 ID 分配。

---

### 3.9 处罚机制 / 安全中心 / 统一举报系统（本次提交新增）

三个新模块（`lib/penalty.js` / `routes/penalty.js` / `routes/reports.js` / `safety.html` / `pages/safety.html`）构成内容安全闭环。后台管理界面 `admin.html` 另含「处罚管理」（`page-punishments`，`loadPunishments()`）与「申诉处理」（`page-appeals`，`loadAppeals()`）两个页面：申诉处理页通过 `GET /api/admin/appeals` 拉取申诉列表（按 `status` 过滤），在弹窗内可查看关联处罚与申诉内容，并调用 `appeal-action` 通过/驳回。

**统一举报入口（`routes/reports.js`）**
- 单一公开入口 `POST /api/reports`，按 `type` 区分内容类型：`post` / `comment` / `discussion` / `discussion_comment` / `qa_question` / `qa_answer` / `featured` / `auction`，生成 `REPO-` 前缀唯一 ID（`generateId('REPO')`）。
- 创建时调用 `penalty.getReportedContent()` 取被举报内容的**证据快照**（正文 + 图片），写入 `evidenceContent` JSON，使后续处理不依赖原文是否被删改。
- 同时向举报人发系统通知（含 `reportId`）。`GET /api/reports/:reportId` 详情（举报人或管理员可见）；`GET /api/user/my-reports` 我的举报（安全中心用）。
- 拍卖举报（`routes/pickup.js`）在写入 `pickup_reports` 后，会同步调用 `createReport({type:'auction'})` 进入统一举报表，便于统一管理与用户安全中心查看。
- **自动合并**：同一条内容有已创建的 `pending` 举报时，新举报不会创建新记录，而是将新举报人加入已有举报的 `reporters` 数组并合并举报原因（去重）。`reportedBy` 保持首位举报人。原举报人收到已合并通知。

**处罚机制（`lib/penalty.js` + `routes/penalty.js`）**
- 两级处罚：
  - `T0`（全面限制）：`isFeatureBlocked()` 直接返回 `true`，禁止所有交互。
  - `T1`（部分限制）：仅禁止 `measures` 中列出的功能。
- `FEATURES = ['whisper','anonymous_post','qa','post','vote']`；`isFeatureBlocked(userId, feature)` 在 `routes/posts.js`（发帖/匿名发帖）、`routes/discussions.js`、`routes/qa.js`、`routes/votes.js`、`routes/pickup.js`（拍卖）的发帖/互动入口前被调用，命中则拒绝并提示。
- `getActivePunishment()` 带**自动过期翻转**（到期自动置 `expired`）。同一用户同时有 T0 和 T1 时，始终返回 T0（T0 优先）。T0 过期后自动检查 `queued` 状态的 T1 并将其激活。
- **处罚自动叠加规则**（`POST /api/admin/punishments` 内实现）：
  - `T0 + 已有 T0`：合并到已有 T0，取最长有效期。若有关联 T1 则标记为 `overridden`。
  - `T0 + 已有 T1`：创建新 T0，已有 T1 入队等待（`status=queued`），T0 过期后自动激活 T1。
  - `T0（单独）`：正常创建新 T0。
  - `T1 + 已有 T1`：合并措施去重并集 + 取最长有效期。
  - `T1 + 已有 T0`：将新 T1 创建为 `status: 'queued'`，标记 `queuedAfter: existingT0.punishmentId`。用户收到「待执行处罚」通知而非完整的处罚通知。T0 过期后由 `getActivePunishment()` 自动激活入队的 T1。
  - `T1（单独）`：正常创建新 T1。
- 管理员接口：`GET/POST /api/admin/punishments`、详情 `:id`、撤销 `:id/revoke`、申诉处理 `:id/appeal-action`（`approved` 撤销处罚并通知 / `rejected`）。从举报处理处罚时，回填 `report.handledResult='violation'`、`report.punishmentId`，并通知举报人。
- 申诉列表接口：`GET /api/admin/appeals`（可按 `status=pending|approved|rejected` 过滤），返回每条申诉并关联处罚信息（级别/原因/状态/限制功能）与用户昵称/UID，供后台「申诉处理」页使用。

**安全中心（前端 `safety.html` + 接口 `/api/user/safety-center`）**
- 单接口聚合：进行中处罚 `activePunishment`、历史处罚 `history`、我的举报 `myReports`。
- 页面双 tab：「我的举报」「我的处罚」；处罚卡片可展开看原因/限制功能/时长/证据快照，支持在线提交申诉（`POST /api/user/punishments/:id/appeal`，每处罚仅一次机会 `appealUsed`）。
- 入口：`index.html` 侧边栏「安全中心」→ 新开 `safety.html`。

**被处罚弹窗（`index.html`）**
- 页面加载时 `checkPunishment()` 调 `/api/user/safety-center`；若 `activePunishment` 存在，弹出 `punishPopup` 告知限制功能与时长，按钮跳转 `safety.html` 查看详情。

### 3.10 信用分系统（`lib/credibility.js` — 本次新增）

**信用分（Credibility Score）** 是独立于 Credit 积分的行为评分体系，用于衡量用户在社区中的可信度。初始 90 分，通过同学验证 +10 分。

**功能限制阈值**：
- `< 90 分`：禁止悄悄话（whisper）
- `< 85 分`：禁止匿名发帖/拍卖（anonymous_post）
- `< 80 分`：禁止你问我答（qa）
- `< 60 分`：禁止发帖/讨论（post）
- `< 50 分`：禁止投票（vote）

**Credit 兑换信用分**：
- 累计兑换 ≤5 分：300 credits = 1 分
- 累计兑换 6-10 分：700 credits = 1 分
- 累计兑换 11-15 分：1000 credits = 1 分
- 每季度上限 15 分
- 刷新日：1月1日、3月1日、6月1日、9月1日（`credibility_last_refresh` 记录上次刷新时间，`credibility_exchanged_total` 记录本季度已兑换量）

**与处罚系统结合**：
- `POST /api/admin/punishments` 支持 `credibilityDeduction` 参数，创建处罚时同步扣除信用分
- `POST /api/admin/punishments/:id/revoke` 撤销处罚时返还信用分
- `POST /api/admin/punishments/:id/appeal-action` 申诉通过时返还信用分
- 处罚记录中 `credibilityDeducted` 字段记录扣除量

**核心 API**（`routes/user.js`）：
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/user/credibility-info` | 用户 | 信用分信息（分数/兑换量/汇率/明细/阈值） |
| POST | `/api/user/exchange-credibility` | 用户 | 用 credits 兑换信用分（body: `{credits}`） |
| GET | `/api/user/credibility-logs` | 用户 | 信用分变动日志 |

**管理 API**（`routes/admin.js`）：
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/credibility-logs` | 管理员 | 信用分日志（可按 `?userId=` 过滤） |
| POST | `/api/admin/user/:id/credibility` | 管理员 | 修改信用分（body: `{action:'set'|'add'|'deduct', amount, reason}`） |

**DB 变更**（`db.js` migrate 自动迁移）：
- `users` 表新增列：`credibility_score`(INTEGER DEFAULT 90)、`credibility_exchanged_total`(TEXT)、`credibility_last_refresh`(TEXT)
- 新增表 `credibility_logs`：id, userId, amount, score, reason, type, createdAt

**安全中心前端 `safety.html`**：
- 仪表盘第三列显示信用分概览
- 信用分明细卡片（日志列表）
- Credit → 信用分兑换面板（含汇率展示、输入、兑换按钮）
- 三张说明卡片：信用分说明 / 兑换说明 / 失信处罚说明

### 3.11 发帖可见性 / 允许评论 / 敏感词拦截（本次提交新增）

**帖子可见性（visibility）**：
- `posts` 表新增 `visibility` 列（值：`'public'` 公开 / `'self_only'` 仅自己可见），默认 `'public'`。
- 发帖（`POST /api/posts`）接收 `visibility` 参数：用户可选 `public`（所有人可见）或 `self_only`（仅作者自己可见）。
- **讨论区同步的帖子始终为 `public`**（`visibility` 不可为 `self_only`）。
- `GET /api/posts`：非作者看不到 `self_only` 帖子（按 `x-user-token` 过滤）。`GET /api/posts/:id`：非作者访问 `self_only` 帖子返回 `{ok:false, msg:'此内容仅自己可见', code:'SELF_ONLY'}`。
- 帖子可见情况写入数据库后**不可修改**（除非敏感词举报无违规后由后台恢复为 public）。
- 前端 `index.html` 发帖弹窗新增「更多选项」折叠区（含 `selfOnlyPost` 复选框，`allowComments` 默认勾选）。帖子卡片 `self_only` 显示「👁️ 仅自己可见」标识；`post.html` 顶部固定白色横幅提示「此内容仅自己可见」；`admin.html` 帖子管理表格「可见性」列显示状态。

**是否允许评论（allowComments）**：
- `posts` 表新增 `allowComments` 列（BOOLEAN，默认 `true`）。
- 发帖时接收 `allowComments` 参数（默认 `true`）。`false` 表示该帖不允许评论。
- `POST /api/posts/:id/comments`：若 `post.allowComments === false` 返回 `{ok:false, msg:'本帖不允许评论', code:'COMMENTS_DISABLED'}`。
- 前端：帖子详情弹窗（`index.html`）和帖子详情页（`post.html`）在 `allowComments === false` 时显示「本帖不允许评论」并禁用输入框/按钮；`admin.html` 帖子详情显示「允许评论」状态。

**敏感词拦截新机制（sensitiveForce）**：
- 发帖检测命中敏感词且 `sensitiveForce=true` 时，帖子 `visibility` 强制设为 `'self_only'`（审核通过前仅自己可见）。
- 敏感词警告弹窗（`showSensitiveWarning()`，index.html / post.html）文案新增提示：「如果你继续发送，帖子在审核通过前仅你可见」。
- 后台处理举报（`POST /api/admin/reports/:id/handle`）的 `no_violation` 分支：若 `report.type` 以 `'sensitive_'` 开头且目标帖子为 `self_only`，则恢复为 `public`（用 `db.readPosts()` / `db.writePosts()`）。

**DB 变更**（`db.js` migrate 自动迁移）：
- `posts` 表新增列：`visibility`（TEXT DEFAULT 'public'）、`allowComments`（INTEGER DEFAULT 1）

## 4. 数据模型（db.js — SQLite 表）

数据库文件：`data/campus.db`，WAL 模式。所有表在 `migrate()` 中 `CREATE TABLE IF NOT EXISTS` 自动建表（**无需手动迁移**）。代码统一通过 `readXxx()` / `writeXxx()` 接口访问（底层用 `dropAndInsert` 全表替换或 `insertRow` 单行插入）。

> `writeXxx` 多数走「读全表 → 改内存数组 → 全表 DELETE + 重插」模式（`dropAndInsert`）。**高频写入场景要注意性能**，但本项目数据量小，可接受。

### 4.1 核心业务表

| 表 | 关键字段 | 用途 |
|----|----------|------|
| `users` | id(PK), username(UNIQUE), password, nickname, avatar, uid, regIp, createdAt, status('active'/'banned'), postCount, bindAdminId, bindAdminRole, credit, checkedInDate, checkinStreak, banUntil, zhixueStatus, certData(加密), zhixueReviewedBy, zhixueCertType, zhixueUsername/Password, zhixueManual*, certRealName, certClassName, noticePublisher, **credibility_score**(INTEGER DEFAULT 90), **credibility_exchanged_total**(TEXT), **credibility_last_refresh**(TEXT) | 用户账号 + 认证 + 积分 + 信用分 |
| `posts` | id(PK), content, author, avatar, userId, time, type('text'/板块), deleted, pinned, images(JSON), isAnonymous, likes, likedBy, comments(JSON), commentsCount, discussionId, rotate, zIndex, deletedAt, deletedBy, **visibility**(TEXT DEFAULT 'public'), **allowComments**(INTEGER DEFAULT 1) | 帖子 |
| `admins` | id(PK), password, name, role('admin'/'super'), createdAt | 管理员 |
| `login_logs` | id, type, account, success, ip, ua, time | 登录日志（最多保留 500 条） |
| `reports` | id(PK), type, targetId, postId, reason, reportedBy, reporterName, reportedUserId, createdAt, status('pending'/'resolved'/'ignored'), handledBy, handledAt, action, **reportId**(`REPO-` 唯一ID，用户可见), **evidenceContent**(证据快照 JSON), **handledResult**('violation'/'no_violation'), **punishmentId**(关联处罚), **reporters**(JSON, 合并举报人数组 [{id,name,reportedAt}]), **mergedCount**(合并次数) | 统一举报（见 §3.9；`reportId`/`evidenceContent`/`handledResult`/`punishmentId` 由 db.js 列迁移自动补齐）。同内容举报自动合并到 `reporters` 数组 |
| `punishments` | punishmentId(PK), userId, level('T0'/'T1'), reason, measures(JSON), durationDays, status('active'/'expired'/'revoked'/'queued'/'overridden'), sourceReportId, appealUsed, appealStatus('none'/'pending'/'approved'/'rejected'), createdAt, expiresAt, revokedAt, revokedBy, **queuedAfter**(被 T0 入队时记录阻塞的 T0 处罚ID) | 处罚记录（见 §3.9）。`queued`=T0 生效期间入队等待，`overridden`=被升级的 T0 覆盖 |
| `appeals` | id(PK), punishmentId, userId, content, status('pending'/'approved'/'rejected'), createdAt, handledAt, handledBy, resultNote | 申诉记录（见 §3.9，每处罚限一次） |
| `feedbacks` | id, type, description, contact, images, time, status, handledBy, handleNote | 用户反馈 |
| `bullying` | id(PK), reportId(BULL-唯一ID), reporterRole('self'/'witness'), victimName, bullyType, description, involved, involvedUsers(JSON [{id,nickname}]), contentIds(JSON [内容ID]), location, incidentTime, contact, anonymous, images(JSON), time, status('pending'/'processing'/'resolved'), handledBy, handledAt, handleNote, handledResult('bullying'/'not_bullying'), userId | 霸凌举报（含涉事用户列表+相关内容ID列表） |
| `credit_logs` | id, userId, amount, reason, createdAt | 积分变动日志 |
| `credibility_logs` | id(PK 'CRDL-'), userId, amount, score, reason, type('exchange'/'deduction'/'restore'/'refresh'/'bonus'/'admin'), createdAt | 信用分变动日志 |
| `credit_cards` | id, code(UNIQUE), value, status('active'/used), createdBy, createdAt, usedBy, usedAt | 积分卡密 |
| `announcement` | _id, title, content, createdAt, updatedAt, publishedAt, publishedBy | 全站公告（单行） |
| `discussions` | id, title, expiresAt, deleted, createdAt, createdBy, commentCount | 讨论话题（最多 3 个活跃） |
| `discussion_comments` | id, discussionId, parentId, content, author, avatar, userId, createdAt, deleted, syncPostId, likes, likedBy, hidden | 讨论评论（支持嵌套 parentId） |
| `qa_questions` | id, userId, author, avatar, title, content, bounty, deadline, status('open'/...), acceptedAnswerId, distributedCredits, deleted, images | QA 提问 |
| `qa_answers` | id, questionId, userId, author, avatar, content, likes, likedBy, accepted, reward, deleted, images | QA 回答 |
| `pickup_auctions` | id, slot, date, userId, content, anonymous, amount, time, reviewStatus, isHighest, approvalStatus, bids(JSON), status, createdAt | 捡漏/失物拍卖 |
| `pickup_reports` | id, bidId, slot, content, reason, reporterId, reporterName, status, time | 拍卖举报 |
| `notices` | id, title, content, author, auto, level('T1'/...), createdAt, deleted, pinned, synced, targetUserId, images | 校园通知 |
| `notice_passkey` | _key, _value | 通知发布口令 |
| `notice_applications` | id, name, department, contact, reason, userId, userNickname, status, createdAt, reviewedAt, reviewedBy | 通知发布申请 |
| `user_notifications` | id, userId, notificationId, read, createdAt, readAt | 用户通知已读状态 |
| `student_council` | _key, _value | 学生会配置（key-value） |
| `whispers` | id, senderId, senderName, receiverId, receiverName, content, notifLevel, createdAt, deleted | 私信/密语 |

### 4.2 投票 / 评分 / 其它表

| 表 | 关键字段 | 用途 |
|----|----------|------|
| `votes` | id(PK), userId, author, avatar, title, options(JSON), multiple, endTime, createdAt, deleted | 投票 |
| `vote_records` | id, voteId, optionId, userId, createdAt | 投票记录 |
| `vote_ip_records` | id, voteId, ip, userId, createdAt | 同 IP 去重 |
| `trust_score_logs` | id, userId, amount, score, reason, createdAt | 信任分日志 |
| `trust_tokens` | _key, userId, userAgent, createdAt, expiresAt | 浏览器信任令牌 |
| `deleted_items` | _id, id, type, content, author, userId, deletedAt, deletedBy, extra | 软删除内容归档（type: post/comment/discussion/disc_comment/qa_question/qa_answer/auction） |
| `maintenance` | _key(PK), _value | 维护模式状态（key-value） |

> 索引：posts(deleted/userId/time)、users(id)、reports(status) 等（见 db.js `INDEXES`）。

---

## 5. API 参考（按功能模块分组）

> 约定：`无`=公开，`用户`=需 `x-user-token`，`管理员`=需 `x-admin-token`，`超级`=需 `x-admin-token` 且 role=super。
> 返回格式统一为 `{ ok: bool, msg?, data?, code? }`（错误常带 `code` 便于前端判断）。

### 5.1 管理员引导与认证（auth.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/check-init` | 无 | 是否需初始化（`needInit`） |
| POST | `/api/admin/init` | 无 | 创建首个 super 管理员（账号 3-20 位字母数字下划线，密码≥6） |
| POST | `/api/admin/login` | 无 | 管理员登录（带登录限流 `rateLimitLogin('id')`） |
| POST | `/api/admin/change-pwd` | 管理员 | 改密码（需旧密码） |
| GET | `/api/admin/me` | 管理员 | 当前管理员信息 |
| GET | `/api/admin/login-logs` | 管理员 | 登录日志 |
| GET | `/api/admin/list` | 超级 | 管理员列表 |
| POST | `/api/admin/add` | 超级 | 新增管理员 |
| DELETE | `/api/admin/:id` | 超级 | 删除管理员（保护 wr1Ench/自己） |
| PUT | `/api/admin/:id` | 超级 | 修改管理员（密码/昵称/角色） |

### 5.2 用户账号（user.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/user/register` | 无 | 注册（用户名/密码/昵称 + 滑块验证码） |
| POST | `/api/user/login` | 无 | 登录（限流 `rateLimitLogin('username')`） |
| POST | `/api/user/zhixue-login` | 无 | 智学网账号登录 |
| POST | `/api/user/auto-login` | 无 | 信任浏览器后自动登录 |
| GET | `/api/user/me` | 用户 | 当前用户信息 |
| PATCH | `/api/user/me` | 用户 | 修改资料（昵称/头像等） |
| POST | `/api/user/forgot-password` | 无 | 找回密码（需已认证） |
| POST | `/api/user/trust-browser` | 用户 | 信任当前浏览器（绑定 trustToken） |
| POST | `/api/user/revoke-trust` | 用户 | 撤销信任 |
| POST | `/api/user/heartbeat` | 用户(可选) | 在线心跳 |
| POST | `/api/user/checkin` | 用户 | 每日签到（+10 credit） |
| GET | `/api/user/checkin-status` | 用户 | 今日是否已签到 |
| GET | `/api/user/credit-logs` | 用户 | 积分日志 |
| POST | `/api/user/redeem-credit` | 用户 | 卡密兑换积分 |
| POST | `/api/user/bind-zhixue` | 用户 | 提交智学网认证申请 |
| POST | `/api/user/confirm-zhixue` | 用户 | 确认智学认证 |
| POST | `/api/user/deny-zhixue` | 用户 | 拒绝智学认证 |
| POST | `/api/user/bind-admin` | 用户 | 绑定管理员 |
| DELETE | `/api/user/bind-admin` | 用户 | 解绑管理员 |
| GET | `/api/user/me/zhixue-info` | 用户 | 我的认证信息 |
| GET | `/api/user/qrcode/generate` | 用户 | 生成扫码登录二维码 |
| GET | `/api/user/qrcode/scan` | 用户 | 标记已扫码 |
| GET | `/api/user/qrcode/status` | 用户 | 轮询扫码状态 |
| POST | `/api/user/qrcode/confirm` | 用户 | 确认扫码登录 |
| GET | `/api/user/notifications` | 用户 | 通知列表 |
| GET | `/api/user/notifications/unread-count` | 用户 | 未读数量 |
| POST | `/api/user/notifications/mark-read` | 用户 | 标记单条已读 |
| POST | `/api/user/notifications/mark-all-read` | 用户 | 全部已读 |
| GET | `/api/user/notice-app-notification` | 用户 | 通知应用提示 |
| GET | `/api/user/credibility-info` | 用户 | 信用分信息（分数/兑换量/汇率/明细/阈值） |
| POST | `/api/user/exchange-credibility` | 用户 | credits 兑换信用分（body: `{credits}`） |
| GET | `/api/user/credibility-logs` | 用户 | 信用分变动日志 |

### 5.3 帖子 / 评论 / 点赞 / 举报（posts.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/posts` | 无 | 帖子列表（支持板块/搜索/排序） |
| GET | `/api/posts/:id` | 无 | 帖子详情 |
| POST | `/api/posts` | 用户 | 发帖（频率限制 + 敏感词检测；支持 `visibility`/`allowComments` 参数，`sensitiveForce` 时强制 `self_only`） |
| PUT | `/api/posts/:id` | 用户/管理员 | 编辑帖子 |
| DELETE | `/api/posts/:id` | 管理员 | 删除帖子 |
| DELETE | `/api/user/posts/:id` | 用户 | 删除自己的帖子 |
| POST | `/api/posts/batch-delete` | 管理员 | 批量删除 |
| POST | `/api/posts/:id/like` | 用户 | 点赞/取消 |
| GET | `/api/posts/:id/comments` | 无 | 评论列表 |
| POST | `/api/posts/:id/comments` | 用户 | 发评论（`allowComments=false` 时返回 `COMMENTS_DISABLED`） |
| DELETE | `/api/posts/:id/comments/:commentId` | 用户/管理员 | 删评论 |
| POST | `/api/posts/:id/report` | 用户 | 举报帖子 |
| POST | `/api/comments/:id/report` | 用户 | 举报评论 |
| POST | `/api/comments/batch-delete` | 管理员 | 批量删评论 |

### 5.4 用户搜索 / 主页 / 公开资料
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/users/search?q=xxx` | 无 | 搜索用户，按 `q` 匹配账号/昵称/UID(user.id)/实名姓名，返回分类结果（accounts/nicknames/uids/names，每类上限 20）。`q` 需至少 2 个非空格字符 |
| GET | `/api/users/:id` | 无 | 用户公开资料 |
| GET | `/api/users/:id/posts` | 无 | 用户历史帖子 |
| GET | `/api/user/notices` | 用户 | 用户相关通知 |

### 5.5 讨论区（discussions.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/discussions` | 无 | 讨论列表 |
| POST | `/api/discussions` | 用户 | 创建讨论（最多 3 活跃） |
| PUT | `/api/discussions/:id` | 管理员 | 编辑 |
| DELETE | `/api/discussions/:id` | 管理员 | 删除 |
| GET | `/api/discussions/:id/comments` | 无 | 评论列表 |
| POST | `/api/discussions/:id/comments` | 用户 | 发评论（支持嵌套 parentId） |
| DELETE | `/api/discussions/comments/:id` | 用户/管理员 | 删评论 |

### 5.6 QA 悬赏问答（qa.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/qa/questions` | 无 | 问题列表 |
| POST | `/api/qa/questions` | 用户 | 提问（可设 bounty 积分悬赏） |
| GET | `/api/qa/questions/:id` | 无 | 问题详情 |
| DELETE | `/api/qa/questions/:id` | 用户/管理员 | 删问题 |
| POST | `/api/qa/questions/:id/answers` | 用户 | 回答 |
| DELETE | `/api/qa/answers/:id` | 用户/管理员 | 删回答 |
| GET | `/api/qa/my-questions` | 用户 | 我的提问 |
| POST | `/api/qa/questions/:id/accept/:aid` | 用户 | 采纳回答 |
| GET | `/api/qa/questions/:id/reward` | 用户 | 发放悬赏 |
| GET/POST | `/api/qa/answers/:aid/like` | 用户 | 答案点赞 |
| GET | `/api/admin/qa/questions` | 管理员 | 后台问题列表 |

### 5.7 投票（votes.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/votes` | 无 | 投票列表 |
| POST | `/api/votes` | 用户 | 创建投票 |
| GET | `/api/votes/:id` | 无 | 投票详情 |
| DELETE | `/api/votes/:id` | 用户/管理员 | 删除 |
| PUT | `/api/votes/:id` | 管理员 | 编辑 |
| POST | `/api/votes/:id/vote` | 用户 | 投票（含同 IP 去重） |
| POST | `/api/votes/:id/end` | 用户/管理员 | 结束投票 |
| GET | `/api/admin/votes` | 管理员 | 后台列表 |
| POST | `/api/admin/votes` | 管理员 | 后台创建 |
| PUT | `/api/admin/votes/:id` | 管理员 | 后台编辑 |
| DELETE | `/api/admin/votes/:id` | 管理员 | 后台删除 |

### 5.8 校园通知 / 公告 / 学生会（notices.js + student-council.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/notices` | 无 | 通知列表 |
| POST | `/api/notices` | 用户/发布者 | 发布通知 |
| GET | `/api/user/notices` | 用户 | 我的通知 |
| DELETE | `/api/notices/:id` | 管理员/作者 | 删通知 |
| POST | `/api/notices/:id/pin` | 管理员 | 置顶 |
| POST | `/api/notices/:id/sync` | 管理员 | 同步到墙 |
| PUT | `/api/notices/:id` | 管理员/作者 | 编辑 |
| GET | `/api/announcement` | 无 | 全站公告 |
| POST | `/api/announcement` | 管理员 | 设置公告 |
| DELETE | `/api/announcement` | 管理员 | 清除公告 |
| POST | `/api/notice-account/apply` | 用户 | 申请通知发布权限 |
| GET | `/api/student-council/me` | 无 | 学生会状态 |
| POST | `/api/student-council/login` | 无 | 学生会登录（滑块验证码） |

> 注：前端 `notice.html` 还调用了 `/api/notice/votes/*`、`/api/student-council/*` 等路径，与 votes / student-council 模块对应。

### 5.9 失物 / 捡漏拍卖（pickup.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/pickup/auctions` | 无 | 拍卖列表 |
| GET | `/api/pickup/current` | 无 | 当前拍卖 |
| GET | `/api/pickup/today-content` | 无 | 今日内容 |
| GET | `/api/pickup/my-bids` | 用户 | 我的出价 |
| DELETE | `/api/pickup/my-bid/:bidId` | 用户 | 删除自己的出价（仅审核前可删，退还冻结 Credits） |
| GET | `/api/pickup/auction-detail/:slot` | 无 | 某时段详情 |
| POST | `/api/pickup/bid` | 用户 | 出价 |
| POST | `/api/pickup/report-content/:bidId` | 用户 | 举报内容 |
| GET | `/api/admin/pickup/bids` | 管理员 | 后台出价列表 |
| GET | `/api/admin/pickup/reports` | 管理员 | 后台举报列表 |
| POST | `/api/admin/pickup/review/:bidId` | 管理员 | 审核出价 |
| POST | `/api/admin/pickup/report-action/:reportId` | 管理员 | 处理举报 |

### 5.10 统一举报 / 处罚 / 申诉 / 霸凌（reports/penalty/system/admin）

统一举报（`routes/reports.js`，见 §3.9）：
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/reports` | 用户/匿名 | 提交举报（生成 `REPO-` ID + 证据快照） |
| GET | `/api/reports/:reportId` | 举报人/管理员 | 举报详情（含证据快照） |
| GET | `/api/user/my-reports` | 用户 | 我的举报列表 |

处罚与申诉（`routes/penalty.js`，见 §3.9）：
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/punishments` | 管理员 | 处罚列表（可按 `status` / `userId` 过滤） |
| GET | `/api/admin/appeals` | 管理员 | 申诉列表（可按 `status` 过滤，关联处罚 + 用户信息） |
| GET | `/api/admin/punishments/:id` | 管理员 | 处罚详情（证据快照 + 关联申诉） |
| POST | `/api/admin/punishments` | 管理员 | 新建处罚（按 `userId`；或从举报 `sourceReportId` 处理，自动回填举报；支持 `credibilityDeduction` 参数扣除信用分） |
| POST | `/api/admin/punishments/:id/revoke` | 管理员 | 撤销处罚 |
| POST | `/api/admin/punishments/:id/appeal-action` | 管理员 | 处理申诉（`approved` 撤销处罚 / `rejected`） |
| GET | `/api/user/punishments` | 用户 | 我的处罚（进行中 + 历史） |
| GET | `/api/user/punishments/:id` | 用户 | 处罚详情（含 `canAppeal`） |
| POST | `/api/user/punishments/:id/appeal` | 用户 | 提交申诉（每处罚限一次） |
| GET | `/api/user/safety-center` | 用户 | 安全中心聚合（activePunishment + history + myReports） |

旧/其它：
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/feedback` | 用户 | 提交反馈 |
| POST | `/api/bullying-report` | 用户 | 霸凌举报 |
| GET | `/api/admin/reports` | 管理员 | 举报列表（旧 admin 维度） |
| POST | `/api/admin/reports/:id/handle` | 管理员 | 处理举报 |
| PUT | `/api/admin/reports/:id` | 管理员 | 更新举报 |
| POST | `/api/admin/reports/:id/ban-user` | 管理员 | 封禁被举报用户 |
| GET | `/api/admin/pickup/reports` | 管理员 | 拍卖内容举报列表 |

### 5.11 后台管理 — 用户 / 内容管理（admin.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/users` | 管理员 | 用户列表 |
| GET | `/api/admin/users/:id/detail` | 超级 | 用户详情（含认证信息） |
| POST | `/api/admin/users/:id/ban` | 管理员 | 封禁 |
| POST | `/api/admin/users/:id/unban` | 管理员 | 解封 |
| POST | `/api/admin/users/:id/reset-pwd` | 管理员 | 重置密码 |
| GET | `/api/admin/user/:id/detail` | 超级 | 用户详情（别名） |
| PUT | `/api/admin/user/:id/status` | 管理员 | 设置状态 |
| DELETE | `/api/admin/user/:id` | 管理员 | 删除用户 |
| POST | `/api/admin/user/:id/reset-password` | 管理员 | 重置密码（别名） |
| POST | `/api/admin/users/batch-delete` | 管理员 | 批量删用户 |
| GET | `/api/admin/comments` | 管理员 | 评论列表 |
| DELETE | `/api/admin/comments/:commentId` | 管理员 | 删评论 |
| POST | `/api/comments/batch-delete` | 管理员 | 批量删评论（后台） |
| GET | `/api/admin/stats` | 管理员 | 后台统计 |
| GET | `/api/admin/whispers` | 管理员 | 私信列表 |

### 5.12 后台管理 — 安全 / 敏感词（admin.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/sensitive-words` | 管理员 | 敏感词列表 |
| POST | `/api/admin/sensitive-words/add` | 管理员 | 添加敏感词 |
| POST | `/api/admin/sensitive-words/remove` | 管理员 | 移除敏感词 |
| POST | `/api/admin/sensitive-words` | 管理员 | 批量设置敏感词 |
| DELETE | `/api/admin/sensitive-words/:word` | 管理员 | 删单个 |
| GET | `/api/admin/sensitive-stats` | 管理员 | 敏感词命中统计 |
| GET | `/api/admin/sensitive-whitelist` | 管理员 | 白名单列表 |
| POST | `/api/admin/sensitive-whitelist` | 管理员 | 加白名单 |
| DELETE | `/api/admin/sensitive-whitelist/:word` | 管理员 | 删白名单 |
| GET | `/api/admin/bullying-names` | 管理员 | 霸凌名称库 |
| POST | `/api/admin/bullying-names` | 管理员 | 加名称 |
| DELETE | `/api/admin/bullying-names/:name` | 管理员 | 删名称 |

### 5.13 后台管理 — 反馈 / 霸凌 / 认证审核（admin.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/feedbacks` | 管理员 | 反馈列表 |
| POST | `/api/admin/feedbacks/:id/handle` | 管理员 | 处理反馈 |
| GET | `/api/admin/feedback/:id` | 管理员 | 反馈详情 |
| POST | `/api/admin/feedback/:id/handle` | 管理员 | 处理反馈（别名） |
| GET | `/api/admin/bullying` | 管理员 | 霸凌举报列表（含新字段：involvedUsers, contentIds, victimName, reporterRole, handledResult） |
| GET | `/api/admin/bullying/:id` | 管理员 | 霸凌详情（丰富数据：reporterInfo, involvedUserDetails, contentDetails） |
| POST | `/api/admin/bullying/:id` | 管理员 | 更新霸凌 |
| POST | `/api/admin/bullying/:id/handle` | 管理员 | 处理霸凌（已弃用，改用 /process） |
| POST | `/api/admin/bullying/:id/process` | 管理员 | ⚖️ 综合处理：封禁涉事用户 + 删除相关内容 + 设定结果 + T0通知举报人 |
| GET | `/api/admin/zhixue-pending` | 管理员 | 待审智学认证 |
| GET | `/api/admin/zhixue-records` | 管理员 | 认证记录 |
| PUT | `/api/admin/zhixue/:userId/review` | 管理员 | 审核认证（通过/拒绝） |
| POST | `/api/admin/zhixue/:userId/reset` | 管理员 | 重置认证 |
| GET | `/api/admin/credit-logs` | 管理员 | 积分日志 |
| GET | `/api/admin/credibility-logs` | 管理员 | 信用分日志（可按 `?userId=` 过滤） |
| POST | `/api/admin/user/:id/credibility` | 管理员 | 修改信用分（body: `{action:'set'|'add'|'deduct', amount, reason}`） |

### 5.14 后台管理 — 积分卡密 / 报表（admin.js，多数需超级）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/credit/overview` | 超级 | 积分总览 |
| GET | `/api/admin/credit/search-user` | 超级 | 查用户积分 |
| POST | `/api/admin/credit/grant` | 超级 | 发放积分 |
| POST | `/api/admin/credit/deduct` | 超级 | 扣减积分 |
| GET | `/api/admin/credit-cards` | 超级 | 卡密列表 |
| POST | `/api/admin/credit-cards/create` | 超级 | 生成单张卡密 |
| POST | `/api/admin/credit-cards/batch-create` | 超级 | 批量生成卡密 |

### 5.15 后台管理 — 通知发布 / 维护（admin.js + maintenance.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/notice-applications` | 管理员 | 通知发布申请列表 |
| POST | `/api/admin/notice-applications/:id/review` | 管理员 | 审核申请 |
| GET | `/api/admin/notice-passkey` | 管理员 | 发布口令 |
| POST | `/api/admin/notice-passkey` | 管理员 | 设置口令 |
| GET | `/api/admin/notice-publishers` | 管理员 | 发布者列表 |
| POST | `/api/admin/notice-publishers/add` | 管理员 | 添加发布者 |
| POST | `/api/admin/notice-publishers/remove` | 管理员 | 移除发布者 |
| GET | `/api/admin/notice-account-stats` | 管理员 | 通知账号统计 |
| GET | `/api/admin/maintenance/status` | 管理员 | 维护状态 |
| POST | `/api/admin/maintenance/toggle` | 管理员 | 开/关维护 |
| POST | `/api/admin/maintenance/schedule` | 管理员 | 定时维护 |
| POST | `/api/admin/maintenance/notice-bypass` | 管理员 | 通知绕过开关 |
| POST | `/api/admin/maintenance/bot-testing` | 管理员 | Bot 测试模式（限流） |
| POST | `/api/admin/maintenance/test-key/create` | 管理员 | 生成测试密钥 |
| GET | `/api/admin/maintenance/test-key/list` | 管理员 | 测试密钥列表 |
| DELETE | `/api/admin/maintenance/test-key/:key` | 管理员 | 删测试密钥 |

### 5.16 系统 / 通用（system.js + maintenance.js + slider）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/version` | 无 | git 版本号（sha + message） |
| GET | `/api/stats` | 无 | 公开统计（帖子数等） |
| GET | `/api/stream` | 无 | SSE 实时事件流 |
| POST | `/api/user/heartbeat` | 用户(可选) | 在线心跳（见 3.5） |
| POST | `/api/bullying-report` | 用户 | 霸凌举报提交（system.js，支持 reporterRole/self-witness、emergency mode、involvedUsers、contentIds、reportId BULL-唯一ID） |
| GET | `/api/maintenance/info` | 无 | 维护页轮询状态 |
| POST | `/api/maintenance/verify` | 无 | 测试密钥 + 滑块验证后签发 bypass token |
| POST | `/api/slider-captcha/grant` | 无 | 滑块验证通过，下发 captcha 会话 token |

---

## 6. 前端架构（SPA）

### 6.1 页面模型
- `index.html` 是**主壳**：含完整 HTML、CSS、以及所有页面逻辑（约 360KB，单个大文件承载前台全部交互）。内有 `<div id="main-content">`（约 1846 行）作为 SPA 内容容器。
- 根目录的 `admin.html / user.html / post.html / notice.html / report.html / bully.html / knowledge.html / ecosystem.html` 是**各自完整独立可访问的页面**（直接浏览器打开即可用）。
- `pages/*.html` 是对应页面的**片段**（仅 `<div class="...">` 内容），供 SPA 内部导航时注入 `#main-content`。
- 导航流程：点击 `<a data-spa href="/post.html">` → `spa.js` 拦截 → 带 `X-SPA-Request: 1` 请求 `/post.html` → server.js 返回 `pages/post.html` 片段 → 注入容器并做过渡动画。

### 6.2 SPA 路由（spa.js — class SpaRouter）
- 监听 `click`（data-spa 链接）、`popstate`（浏览器前进/后退）、`mouseover`（预取 `prefetch`）、`scroll`（记录滚动位置）。
- `fetch(url, { headers: { 'X-SPA-Request': '1' } })` 取片段，缓存 60s（`cacheTTL`）。
- 过渡动画：`page-exit` / `page-enter` class + `spa-transitions.css`。
- 页面实例化：`new SpaRouter({ container: '#main-content' })`。

### 6.3 前端调用后端的约定
- 全部用原生 `fetch` 调 `/api/*`。
- 认证：登录后把 token 存入 `localStorage`（或 cookie），每次请求带对应头：
  - 用户：`headers: { 'x-user-token': token }`
  - 管理员：`x-admin-token`
  - 学生会：`x-sc-token`
- 响应判断：`const j = await res.json(); if (j.ok) { ... } else { alert(j.msg) }`。
- 用户搜索：`index.html` 操作栏 `action-btns` 最右侧有「找人」按钮（`.search-btn`），点击弹出带渐入动画的下拉气泡 `#searchDropdown`（`.open` 时 `opacity`/`transform` 过渡），输入关键词后 300ms 防抖调 `GET /api/users/search?q=xxx`，结果按「匹配账号/匹配昵称/匹配UID(user.id)/匹配姓名」四类分组展示，点击结果打开 `user.html?id=xxx`。点击外部或按 Esc 关闭。**搜索需要至少 2 个非空格字符**（空格不计入字符数），后端 `/api/users/search` 与前端（`doSearch`/`whisperSearch`）均有此限制。
- 错误 `code` 常见：`NOT_LOGIN` / `INVALID_TOKEN` / `TOKEN_EXPIRED` / `FORBIDDEN` / `MAINTENANCE` / `RATE_LIMITED` / `ALREADY_INIT`。
- 富文本渲染：引入 `marked.min.js`（CDN）做 Markdown；内容经 `inputSanitize` + 客户端转义防 XSS。
- 滑块验证码：`slider-captcha/longbow.slidercaptcha.min.js`，先 `POST /api/slider-captcha/grant` 拿 `captchaId`，用户拖动完成后提交 `captchaId` + `captchaText`。**captcha token 仅在业务成功后才被消费（`captchaStore.delete`）**，登录/注册/智学登录若因输入错误失败，captcha 仍有效，用户修正后可重试无需再次验证。

### 6.4 如何新增一个前端页面
1. 在根目录新建 `xxx.html`（完整独立页，参考现有页面结构）。
2. 在 `pages/` 下新建 `xxx.html` 片段（仅容器 div 内容）。
3. 在 `server.js` 的 `PAGE_MAP` 增加 `'/xxx.html': 'pages/xxx.html'`。
4. 用 `<a data-spa href="/xxx.html">` 链接即可被 SPA 接管。

---

### 6.5 安全中心前端（safety.html / pages/safety.html）
- `safety.html`：独立可访问的「🛡️ 安全中心」页，双 tab（我的举报 / 我的处罚）；处罚卡片可展开看原因/限制功能/时长/证据快照，并支持在线申诉（弹窗提交 `POST /api/user/punishments/:id/appeal`）。
- `pages/safety.html`：对应 SPA 片段，供 `index.html` 主壳内导航注入。
- 入口：`index.html` 侧边栏「安全中心」→ `window.open('safety.html')`。
- 被处罚弹窗：`index.html` 内置 `punishPopup`；页面加载时 `checkPunishment()` 调 `/api/user/safety-center`，若存在 `activePunishment` 则弹出限制说明，「查看详情」跳转 `safety.html`。

## 7. 微信小程序端（campus-wall-miniprogram/）

独立微信原生小程序项目，与网页版共享后端 API。
- `app.js`：全局 `API_BASE = 'http://154.37.221.232/api'`（**硬编码 IP，需改成你的后端地址**）。`onLaunch` 校验 token 并刷新 userInfo。
- `pages/index/`、`pages/login/`、`pages/notice/`：对应首页、登录、通知。
- 调后端：`wx.request({ url: API_BASE + '/user/me', header: { 'x-user-token': token } })`。
- 配置：`project.config.json` 改 appid；`app.json` 注册页面；`create_icons.py` 生成图标。
- 注意：小程序要求 HTTPS 合法域名，本地调试需开「不校验合法域名」。

---

## 8. 配置与环境变量（.env）

复制 `.env.example` 为 `.env`（`.env` 被 gitignore，不提交）。关键变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `TOKEN_SECRET` | 建议 | Token 签名密钥。不设则每次重启随机生成，导致所有已签发 token 失效（用户需重新登录）。 |
| `CERT_ENC_SECRET` | 强烈建议 | 实名信息 AES-256 加密密钥（64 字符 hex）。不设则随机生成，**重启后已加密的实名数据无法解密**。生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SENSITIVE_KEY` | 是（用腾讯词库时） | 解密 `tencent_sensitive_words.enc` 的 32 字节 hex 密钥 |
| `PORT` | 否 | 监听端口（默认 3000） |

> 安全警告：部署生产务必设置 `TOKEN_SECRET` 和 `CERT_ENC_SECRET`，否则存在重启丢会话 / 无法解密风险。

---

## 9. 常见坑与开发须知（务必先读）

1. **路由挂载顺序**（3.4）：`admin.js` 必须在 `auth.js` 前，否则 `/api/admin/votes/:id` 被 `/api/admin/:id` 吞掉。
2. **输入过滤白名单**（3.3）：新增需要保留特殊字符的 body 字段必须加进 `inputSanitize` 白名单，否则被清空。
3. **内存状态非持久**（3.5）：`captchaStore` / `postRateLimit` / `loginFailures` 等是内存 Map，重启清空。验证码/限流状态不要依赖它跨重启。
4. **Token 有效期差异**：用户 token 7 天（`verifyUserToken`），管理员 24 小时（`requireAdmin` 强制）。前端处理 `TOKEN_EXPIRED` 要引导重新登录。
5. **维护模式闸门**：改动公开接口时确认是否被 `createCheckMaintenance` 拦截；管理员路径已放行。
6. **db 写入模式**：`writeXxx` 多为「全表 DELETE + 重插」。并发写同一张表有竞态风险（本项目单进程可接受）。大批量写入注意性能。
7. **wr1Ench 保护**：任何删除/降权管理员的代码都不能动 `wr1Ench`。
8. **SSE 事件名**：`postUpdate` / `noticeUpdate` / `ping`，前端若接实时推送需监听这些 event。
9. **敏感词库**：`sensitiveWords.js` 加载 `tencent_sensitive_words.enc`（需 `SENSITIVE_KEY` 解密），另含自定义 `sensitive_custom.json`。改词库走后台接口或文件，不要硬编码。
10. **滑块验证码**：`POST /api/slider-captcha/grant` 返回 `captchaId`，存于 `captchaStore`（5 分钟 TTL），后续接口需带 `captchaId` + `captchaText`。
11. **桌面端强制移动端 UI（3.1 第 6 项）**：前台页面在桌面浏览器会被 `server.js` 的 iframe 设备框包裹（内切 `?mf=1` 真实页）。**后台 `admin.html` 不受影响**，仍走桌面布局。要新增需强制移动端的前台页，必须在 `server.js` 的 `FRAME_PAGES` 中登记，否则桌面端会显示桌面布局。改 CSS 断点（`max-width:768px` / `min-width:769px`）时需同步此逻辑。

---

## 10. 如何新增一个后端功能（标准流程）

以「新增一个 `/api/xxx` 模块」为例：

1. **建表**（如需持久化）：在 `db.js` 的 `migrate()` 增加 `CREATE TABLE IF NOT EXISTS`，并加 `readXxx()` / `writeXxx()` 接口（参考已有 `readPosts/writePosts`）。
2. **建路由文件** `routes/xxx.js`，导出 `module.exports = function(app) { app.get('/api/xxx', ...) }`。
3. **在 server.js 挂载**：在合适位置 `require('./routes/xxx')(app);`。
   - 若该模块有 `/api/xxx/:id` 这类与 `/api/admin/:id` 冲突的特化路由，**必须放在 `auth.js` 之前挂载**（见 3.4）。
4. **鉴权**：用户接口在 handler 内 `verifyUserToken(req.headers['x-user-token'])`；管理员接口加 `requireAdmin`（可叠加 `requireSuper`）。
5. **写后广播**（如需实时）：在写操作的 `writeXxx` 包装里加 `broadcastSSE('xxxUpdate', {...})`。
6. **返回格式**：统一 `{ ok: true, data }` 或 `{ ok: false, msg, code }`。
7. **前端对接**：在对应 `*.html` 用 `fetch('/api/xxx', { headers: {...} })` 调用，必要时在 `pages/` 片段同步逻辑。

---

## 11. 运行 / 部署 / 维护

### 本地开发
```bash
npm install
cp .env.example .env      # 编辑填入 TOKEN_SECRET / CERT_ENC_SECRET / SENSITIVE_KEY
npm start                 # 或 node server.js
```
- 前台：http://localhost:3000/
- 后台：http://localhost:3000/admin.html （首次访问引导创建 super 管理员）

### 生产部署（PM2）
```bash
npm install -g pm2
pm2 start server.js --name campus-wall
pm2 logs campus-wall
```

### 数据备份
`data/campus.db`（及 `-wal` / `-shm`）即为全部数据，直接备份该文件即可。`.gitignore` 已忽略 `data/`。

### 索引维护
- 本项目已启用 **CodeGraph** 索引（`.codegraph/`，本地工具，不提交）。AI Agent 编辑前应先用 codegraph 探索相关符号，而非盲目 grep。
- 重建索引：`codegraph index .`；增量：`codegraph sync .`；状态：`codegraph status .`。

---

## 12. 模块依赖速查（调用关系）

```
server.js
├─ lib/crypto.js      (密码/Token/实名加密)  ← middleware, 所有 routes, maintenance
├─ lib/middleware.js  (鉴权/过滤/限流/维护闸门) ← server.js, routes/*
├─ lib/state.js       (内存 Map)              ← middleware(限流), routes(user/auth)
├─ lib/sse.js         (广播)                  ← routes(posts/notices/system/...), system
├─ db.js              (SQLite 读写)           ← 几乎所有 routes
├─ maintenance.js     (维护状态/测试密钥)      ← server.js, routes/maintenance, middleware
└─ routes/*.js        (业务接口)              ← server.js 挂载
```

**高频变更入口**：
- 改登录/密码逻辑 → `lib/crypto.js` + `routes/auth.js` + `routes/user.js`
- 改权限/过滤/限流 → `lib/middleware.js`
- 改任一数据表 → `db.js`（`migrate()` + 接口）
- 改实时推送 → `lib/sse.js` + 对应 route 的 `writeXxx`
- 改前台交互 → 对应 `*.html` + `pages/*.html` + `spa.js`
- 改后台界面 → `admin.html`

---

## 13. 一句话速记（给 AI Agent）

> 这是一个 **Node+Express+SQLite** 的原生前端校园墙。**所有路由全挂在 `app` 上**（无 router 子模块），**`admin.js` 必须在 `auth.js` 前挂载**，**请求体特殊字符被全局过滤但白名单字段保留**，**三类 token 头是 `x-user-token`/`x-admin-token`/`x-sc-token`**，**数据走 `db.js` 的 read/write 接口且多为整表重写**，**内存 Map 重启即丢**，**实时用 SSE `broadcastSSE`**。改代码前先用 codegraph 探索相关符号。

---

## 14. 通知系统深度分析：自动触发通知

> 本节聚焦于「系统/业务事件**自动**产生的通知」，与「管理员/发布者**手动**发布」的通知（notices.js `POST /api/notices`）区分开。结论均来自实查 `routes/*.js` + `db.js`。

### 14.1 双重存储模型（核心认知）

自动触发通知同时写入**两张表**，二者靠 `notificationId` 外键关联：

| 表 | 字段 | 角色 |
|----|------|------|
| `notices` | id, title, content, author, `auto`, level, createdAt, deleted, pinned, synced, **targetUserId**, images | 通知**正文**。`auto:true` 标记该条为自动触发；`targetUserId` 为空=公共通知，有值=用户专属 |
| `user_notifications` | id, **userId**, **notificationId**(外键), read, createdAt, readAt | **已读桥接表**。只记「哪个用户哪条通知、是否已读」，不存正文 |

`db.js:346` 建表；`addUserNotification`(`db.js:822`)、`markNotificationRead`(`db.js:823`)、`getUnreadCount`(`db.js:827`) 是桥接表唯一操作入口。

### 14.2 三条读取/下发通道（注意语义差异！）

| 端点 | 代码位置 | 数据来源 | 已读过滤 |
|------|----------|----------|----------|
| `GET /api/user/notices` | `notices.js:45` / `user.js` 同逻辑 | `notices` 表按 `!targetUserId \|\| targetUserId===我` 过滤 | **不过滤已读**（列全量，含公共通知） |
| `GET /api/user/notifications` | `user.js:1024` | `notices` 表按 `targetUserId===我` 过滤（**不含公共通知**） | 不过滤已读 |
| `GET /api/user/notifications/unread-count` | `user.js:1138` | `user_notifications` 表 `read=0` 计数 | — |
| `POST .../mark-read` / `mark-all-read` | `user.js:1147/1158` | 只改 `user_notifications.read` | — |
| `GET /api/user/notice-app-notification` | `user.js:1120` | **不走表**，读 `user._noticeAppNotification` 字段，**一次性读取即删除** | — |

**关键设计点（易踩坑）**：
- 列表类端点（`/notices`、`/notifications`）只按 `targetUserId` 过滤，**完全不读 `user_notifications.read`**。因此「标记已读」**只影响未读红点计数（badge）**，不改变列表里该通知是否展示。二者是解耦的。
- 未读计数**只依赖桥接表行数**。自动触发时若只写了 `notices` 却漏写 `user_notifications`，该通知会出现在列表但**不计入红点**；反之若只写桥接表漏写 `notices`，红点有数但列表看不到内容。
- `notice-app-notification` 是**完全独立**的通道（发布权限申请自动通过时写入 `user._noticeAppNotification`，`user.js:1078`），既不在 `notices` 表也不在 `user_notifications` 表，且读取一次即删除。

### 14.3 自动触发点完整清单

每一条自动通知的写入都是 **`notices.push({...targetUserId})` + `db.addUserNotification({notificationId,userId,read:0})`** 两步（霸凌/拍卖/举报受理场景）或走 `pushUserNotice()` 封装（认证/举报处理场景）。

| # | 触发事件 | 触发位置 | 接收人 | 标题/级别 | 写入方式 |
|---|----------|----------|--------|-----------|----------|
| 1 | 用户提交帖子举报成功 | `posts.js:540` | 举报人 `reporterId` | 📋 举报已收到 (T1) | 内联 |
| 2 | 管理员处理举报=resolved | `admin.js:1378` `pushUserNotice` | 举报人 `report.reportedBy` | 📋 举报已处理 (T1) | 封装函数 |
| 3 | 管理员处理举报=ignored | `admin.js:1381` `pushUserNotice` | 举报人 | 📋 举报已忽略 (T1) | 封装函数 |
| 4 | 提交霸凌事件举报 | `system.js` | 举报人 `reporterUserId` | 🛡️ 霸凌举报已收到 (T1) | 内联 |
| 5 | 管理员确认处理霸凌(process) | `admin.js:proxyquire` | 举报人 `reports[idx].userId` | 🛡️ 霸凌举报处理结果 (**T0**，含处理结果详情) | `emitUserNotice` |
| 6 | 学生认证被驳回 | `admin.js:641` `pushUserNotice` | 申请人 | ❌ 学生认证未通过 (T1) | 封装函数 |
| 7 | 学生认证通过/初审通过 | `admin.js:680` `pushUserNotice` | 申请人 | ✅ 学生认证已通过 (T1) | 封装函数 |
| 8 | 拍卖内容审核通过 | `pickup.js:300` | 出价人 `bid.userId` | 🏆 拍卖内容已通过审核 (**T0**) | 内联 |
| 9 | 拍卖内容审核未通过(退还 credit) | `pickup.js:327` | 出价人 | ❌ 拍卖内容未通过审核 (T1) | 内联 |
| 10 | 拍卖举报被驳回 | `pickup.js:486` | 举报人 `report.reporterId` | 📋 拍卖内容举报已驳回 (T1) | 内联 |
| 11 | 拍卖举报确认违规(下架+封禁) | `pickup.js:561` | 举报人 | 📋 拍卖内容举报已确认 (T1) | 内联 |
| 12 | 通知发布权限申请自动通过(通行码正确) | `user.js:1078` | 申请人 | 写入 `user._noticeAppNotification`（特殊通道） | 字段写入 |

### 14.4 写入模式的代码异味（给后续维护者）

自动通知的写入**没有统一抽象**，存在明显重复：
- **`pushUserNotice(targetUserId,title,content,level)`**（`admin.js:77`）是较规整的封装：先 `notices.push({id,title,content,author:'系统',auto:true,level,createdAt,targetUserId})`，再 `db.addUserNotification(...)`。被认证驳回/通过、举报处理(admin.js:1378/1381/641/680) 复用。
- 但**霸凌确认(`admin.js /process` route)、霸凌受理(`system.js`)、帖子举报受理(`posts.js:540`)、拍卖审核/举报(`pickup.js` 三处)**全部是**复制粘贴同款逻辑**的 `notices.push`+`addUserNotification`，且字段命名/缩进风格不统一（如 `targetUserId` 有的缩进错位）。
- **建议**：抽一个 `emitUserNotice(targetUserId, {title, content, level})` 公共函数（放 `admin.js` 或 `lib/`），所有自动触发点统一调用，避免「漏写桥接表 / 风格漂移」类 bug。改动时注意 `pushUserNotice` 当前定义在 `admin.js`，其它 route 文件需 `require` 进该函数。

### 14.5 实时下发

- 写入 `notices` 一律走 `writeNotices(notices)`（`notices.js:10`），其内部在写库后调用 `broadcastSSE('noticeUpdate', { t: Date.now() })`。
- 前端/小程序监听 SSE 事件名 **`noticeUpdate`** 即可即时刷新通知（与 `postUpdate`/`voteUpdate` 并列，见 3.6）。`notice-app-notification` 不走 SSE，需前端轮询或登录后主动拉一次。

### 14.6 小结（给 AI Agent 的速记）

- 自动通知 = `notices`(正文,`auto:true`,带`targetUserId`) + `user_notifications`(已读桥) **双写**。
- 红点计数只看桥接表；列表只看 `notices.targetUserId`；二者**解耦**，标记已读不隐藏列表项。
- 自动触发点集中在 5 个文件：posts.js(举报受理)、admin.js(认证/举报处理/霸凌确认/pushUserNotice)、system.js(霸凌受理)、pickup.js(拍卖审核+拍卖举报)、user.js(发布权限申请特殊通道)。
- 写新自动通知：调用/补一个 `emitUserNotice` 风格的封装，确保**双写**且 `auto:true`。
---

## 15. 会话变更日志

> 本节记录 AI Agent 在每次开发会话中对项目所做的全部改动，供后续维护者追溯。

### 会话 1 — 2026-07-12

#### safety.html 修复

| 问题 | 文件 | 行 | 改动 |
|------|------|-----|------|
| 返回按钮不退出 iframe | `safety.html` | 全局 | `location.href='/'` → `window.top.location.href='/'` |
| Token key 不匹配 | `safety.html` | `getToken()` | `'userToken'` → `'campus_user_token'` |
| 举报详情无内容（旧格式无快照） | `safety.html` | `showReportDetail()` | 补充 `fallbackContent` 降级显示 |
| 处罚限制功能显示空 | `safety.html` | `renderPunishCard()` | `escHtml` 兼容数组 + `labelMeasures` 映射 |
| 申诉提交"网络错误" | `routes/penalty.js` | `app.post('/api/user/punishments/:id/appeal')` | `WHERE id = ?` → `WHERE punishmentId = ?` |
| emoji 图标统一替换为 SVG | `safety.html` | 全部 | 所有 emoji 图标替换为 inline SVG；申诉弹窗添加 scale+translateY+opacity 过渡动画 |

#### admin.html 修复

| 问题 | 文件 | 行 | 改动 |
|------|------|-----|------|
| 处罚管理页面转圈 | `admin.html` | `showPage()` | 在 tab 切换逻辑中添加 `'punishments'` |
| 举报处理无申诉查看入口 | `admin.html` | `showReportDetail()` | 增加「查看关联处罚（含申诉）」按钮 |
| 举报处理"网络错误"(reportId 为空) | `admin.html` | 2156 | `r.reportId \|\| ''` → `r.reportId \|\| r.id \|\| ''` |
| 举报弹窗举报人/被举报人 UID 为空 | `routes/admin.js` | 387-389 | 增加 `reporterInfo` 富化（查 `reportedBy`→用户信息） |
| 旧格式举报弹窗无内容 | `admin.html` | 6059-6063 | 无证据快照时降级展示 `report.targetContent`/`report.postContent`/`report.commentContent` |
| 敏感词检测类型无法查被举报人 | `lib/penalty.js` | 97 | `getReportedContent()` 入口归一化 `sensitive_` 前缀 |
| **举报列表被举报贴内容/举报人/举报ID为空** | `routes/admin.js` | 377-395 | 增加 `targetContent` 字段 + 运行时证据快照降级捞取（`getReportedContent`） |
| **举报列表 targetContent 显示** | `admin.html` | 2150 | `r.commentContent \|\| r.postContent` → `r.targetContent`（来自后端富化） |
| **reportedUserId 列缺失** | `db.js` | 423 | 列迁移增加 `reportedUserId` |

#### index.html 修复

| 问题 | 文件 | 行 | 改动 |
|------|------|-----|------|
| 注册协议同意绕过 | `index.html` | `doUserRegister()` | 在注册入口增加 `agreementChecked` 校验 |
| 昵称空格/重复检测 | `index.html` | `doUserRegister()` | 昵称空格报错；服务端 `readUsers` 查重（case-insensitive） |
| 处罚弹窗无过渡动画 | `index.html` | 7385-7395 | `display:none/flex` + `@keyframes` → `visibility/opacity transition` + `.open` 类切换 |
| 敏感词/霸凌弹窗无过渡动画 | `index.html` | 5370, 5400 | 内层 div 添加 `dialog-anim` 类（`animation:` 缩放+上移+淡入） |

#### 敏感词自动举报格式化

| 文件 | 行 | 改动 |
|------|-----|------|
| `routes/posts.js` | 268-280 | 敏感词帖子自动举报增加 `reportId`(REPO-)、`evidenceContent`、`reportedUserId` |
| `routes/posts.js` | 463-476 | 敏感词评论自动举报同上 |
| `routes/discussions.js` | 290-303 | 敏感词讨论评论自动举报同上 |
| `routes/posts.js` | 542-553 | **用户提交帖子举报**增加 `reportId`、`evidenceContent`(截取帖子正文+图片)、`reportedUserId`(被举报人=帖主) |
| `routes/posts.js` | 643-654 | **用户提交评论举报**同上（截取评论正文+图片+被举报人） |
| `routes/posts.js` | 276, 476 | 敏感词自动举报 `reason` 去掉敏感词原文（如 `[六四]`），仅保留"系统自动检测：内容包含敏感词" |
| `routes/discussions.js` | 291 | 同上，讨论评论自动举报 |

#### UID 科学记数法修复

| 问题 | 文件 | 行 | 改动 |
|------|------|-----|------|
| UID 在 DB 中被存储为 `1.23e+15` 科学记数法 | `db.js` | `tryParse()` | 16 位以上纯数字字符串不再转 Number，避免 SQLite 写回时变科学记数法 |
| 已有科学记数法 UID 无法恢复 | `db.js` | `migrate()` | 启动时 `UPDATE users SET uid = ? WHERE uid LIKE '%e%'`，用 `toFixed(0)` 还原 |
| 举报列表 reporter 不显示 UID | `admin.html` | 2166 | 从 `r.reporterName` 改为 `r.reporterInfo.nickname + (username, UID:xxx)` |

#### 举报列表 reporterInfo 展示

| 问题 | 文件 | 行 | 改动 |
|------|------|-----|------|
| 举报列表"举报人"只显示 raw name 无 UID | `admin.html` | 2166 | 用 `reporterInfo.nickname (username, UID:xxx)` 格式显示 |

### 会话 2.5 — 2026-07-15 — 霸凌举报红esign

#### 后端变更

| 文件 | 改动 |
|------|------|
| `lib/uniqueId.js` | 新增 `'BULL'` 到 `VALID_PREFIXES`，支持 `generateId('BULL')` |
| `routes/system.js` | `POST /api/bullying-report` 重构：支持 `reporterRole: 'self'|'witness'`，目击者无需认证；当事人含紧急模式；新增 `involvedUsers`(JSON)、`contentIds`(JSON) 字段；提交时生成 BULL-唯一ID (`logIdAssignment`) |
| `routes/admin.js` | `GET /api/admin/bullying` 列表新增 `involvedUsers`/`contentIds`/`victimName`/`reporterRole`/`handledResult`；新增 `GET /api/admin/bullying/:id` 丰富数据（reporterInfo、involvedUserDetails、contentDetails）；新增 `POST /api/admin/bullying/:id/process` 综合处理（封禁用户→删除内容→写deleted_items→发T0通知） |

#### 前端变更

| 文件 | 改动 |
|------|------|
| `bully.html` | 重写举报表单：self/witness 角色选择 → 自认证判断 → 紧急模式；用户搜索（`/api/users/search?q=`）多选涉事用户；内容ID 改为 `/api/posts/:id` 实时校验；保存/恢复草稿；submit 防抖 |
| `admin.html` | 霸凌列表显示涉事用户数/内容数；详情弹窗丰富（涉事用户详情、内容详情、举报人信息）；新增 `openProcessWindow()` 处理弹窗（可选封禁用户/删除内容/定结果）→ `confirmProcess()` 调用 `/process` |

### 会话 2 — 2026-07-13

#### 讨论区开放用户创建话题

| 文件 | 改动 |
|------|------|
| `routes/discussions.js` | `POST /api/discussions` 新增 `x-user-token` 路径，普通用户可创建话题。增加处罚检测（`isFeatureBlocked`）、频率限制（1分钟最多5次）、敏感词+霸凌姓名检测。原有 admin/SC 路径不变。 |
| `index.html` | 讨论弹窗话题列表增加「＋创建话题」按钮 + 标题输入表单。仅登录用户可见。创建成功后自动刷新列表。 |
| `docs_for_agent.md` | 本会话记录。 |

**频率限制**：`discussionCreateLimit` 内存 Map（1分钟窗口，最多5次），`DISCUSSION_CREATE_WINDOW_MS=60000`，`DISCUSSION_CREATE_MAX=5`。清理随 `commentDeleteLimit` 的 `setInterval` 每60秒执行。

### 会话 4 — 2026-07-14

#### 悄悄话功能

| 改动 | 文件 | 说明 |
|------|------|------|
| 新增 WHIS 前缀 | `lib/uniqueId.js` | `VALID_PREFIXES` 增加 `'WHIS'` |
| whispers 表列迁移 | `db.js` | 增加 `signed`、`signTime` 列 |
| getReportedContent 加 whisper | `lib/penalty.js` | 悄悄话举报证据快照提取 |
| 新建路由文件 | `routes/whispers.js` | `POST /api/whispers` 发送、`GET /api/whispers/inbox` 收件箱、`POST /api/whispers/:id/sign` 签收 |
| 挂载新路由 | `server.js` | 在 student-council 后挂载 |
| 新增悄悄话按钮 | `index.html` | action bar 增加「悄悄话」按钮（粉色主题） |
| 发悄悄话弹窗 | `index.html` | `#whisperModalOverlay` — 搜索用户 + 输入内容（50字限制） |
| 接收通知弹窗 | `index.html` | `#whisperIncomingOverlay` — 签收 + 举报入口 |
| SSE 集成 | `index.html` | `noticeUpdate` 事件触发 `checkIncomingWhispers()` |
| JS 逻辑 | `index.html` | whisperSearch、submitWhisper、signCurrentWhisper、reportCurrentWhisper |

**悄悄话路由详情**：

| 端点 | 方法 | 鉴权 | 功能 |
|------|------|------|------|
| `/api/whispers` | POST | 用户 | 发送：敏感词+霸凌+处罚检测 → 生成 WHIS-ID → 写库 → T1 通知接收方 |
| `/api/whispers/inbox` | GET | 用户 | 收到的悄悄话列表（未签收优先） |
| `/api/whispers/:id/sign` | POST | 用户 | 签收（仅接收者可操作）→ T1 通知发送方 |

**举报集成**：接收弹窗「举报」按钮 → `POST /api/reports`，`type: 'whisper'`，经 `getReportedContent('whisper', id)` 提取证据快照，走统一举报处理流程。
### 会话 8 — 2026-07-15 — 5 项 Bug 修复

#### Bug 1：话题帖子无法发送（# 被特殊字符检测拦截）
- `index.html:3505`：从 `SPECIAL_CHAR_REG` 中移除 `#`，避免 `hasSpecialChars()` 误拦截包含 `#话题` 的帖子。

#### Bug 2：涉事用户搜索结果在添加后重新弹出
- `bully.html:1299`：在「添加」按钮 click 处理函数中增加 `clearTimeout(_involvedSearchTimer)`，防止搜索防抖在关闭下拉后重新打开结果。

#### Bug 3：内容ID确认弹窗重读输入框过期值
- `bully.html:1451`：确认按钮传递 `val`（已捕获的输入值）给 `confirmPostId(val)`，而非再次读取 `postIdInput.value`（可能在等待确认期间被修改或清空）。
- 修改 `confirmPostId(val)` 接受可选参数，有参数时优先使用；保留 fallback 回退读取输入框 **（向后兼容）**。

#### Bug 4：紧急模式草稿恢复后无法提交认证
- `bully.html:1144-1157`：草稿恢复函数 `restoreDraft()` 删除「self 且无 victimRealName 则丢弃草稿」逻辑；改为检测紧急模式并设置 `submitBtn.dataset.mode = 'emergency'`，确保提交时弹出认证窗。

#### Bug 5：霸凌处理窗口涉事用户/内容始终显示 0
- `db.js:186-204`：`bullying` 表 schema 缺失 `involvedUsers` 和 `contentIds` 列，导致 `dropAndInsert()` 生成的 INSERT 中包含不存在的列，SQLite 静默失败，所有 bullying 行丢失。新增列迁移（`tableMigrations`）及 CREATE TABLE 定义。
- `db.js:427`：列迁移增加 `{ name: 'bullying', columns: ['involvedUsers', 'contentIds'] }`。

| 改动 | 文件 | 说明 |
|------|------|------|
| 话题创建需学认证 | `routes/discussions.js` | 普通用户创建讨论话题时检查 `zhixueStatus === 'approved' && zhixueReviewedBy`，否则返回 `NOT_VERIFIED` |
| 讨论+问答举报入口 | `index.html` | 话题列表、话题评论、问答问题、问答答案增加举报按钮，统一调用 `POST /api/reports`（`discussion` / `discussion_comment` / `qa_question` / `qa_answer`）|
| 讨论窗口重设计 | `index.html` CSS + JS + HTML | 暖色调配色（砖棕 `#8b6f5e`），卡片化话题列表，comment 区背景优化，slide-left/slide-right 话题列表↔评论切换动画 |
| 问答窗口重设计 | `index.html` CSS + JS + HTML | 暖金配色优化，qa-question-card/qa-answer-card 重设计，tab 切换 fade+slide 动画，报告按钮样式统一 |
| 讨论评论举报修复 | `index.html` | 旧 `reportDiscussionComment` / `promptReportDiscussion` 调用不存在端点 → 改为统一 `/api/reports` |

### 会话 9 — 2026-07-15 — 5 项 Bug 修复（补全）

#### Bug 1：发帖 #话题 自动同步到讨论区（蓝色可点击链接）
- `routes/posts.js:281-308`：`POST /api/posts` 中新增自动话题识别逻辑。当内容以 `#` 开头且未指定 `syncDiscussionId` 时，提取话题名（空格前或整行），查找现有讨论区话题，未找到则自动创建（7天过期），设置 `post.discussionId` 并同步评论到讨论区。
- 前端 `renderPostContent()` 已有蓝色链接渲染逻辑（`post.discussionId` 存在且内容以 `#` 开头时渲染可点击话题链接）。

#### Bug 2：涉事用户搜索添加后下拉栏重新弹出
- `bully.html:1318-1321`：`doInvolvedSearch()` 的 fetch 回调中增加输入框内容检查。若输入框已被清空（添加按钮点击后），不再展开搜索结果，防止异步回调覆盖 `display:none`。

#### Bug 3：内容ID确认弹窗点击添加后卡在"添加中…"
- `bully.html:1231-1245`：`confirmPostId()` 用 `try/finally` 包裹，确保弹窗始终被关闭；`saveDraft()` 包在 `try/catch` 中防止 `localStorage` 异常导致弹窗卡死。
- `bully.html:1454`：`val` 的 HTML 属性转义增加反斜杠处理（`replace(/\\/g, '\\\\')`），防止 `\` 破坏 `onclick` 中 JS 字符串语法。

#### Bug 4：紧急模式提交时不弹出同学验证窗口
- `bully.html:1007`：`applyVictimNameField()` 中紧急模式下不再强制 `input.value = ''`，避免 `restoreDraft()` 恢复受害人姓名后又被 `applyVictimNameField()` 清空，导致提交时 `victimName` 为空而提前返回。

#### Bug 5：霸凌处理窗口涉事用户/内容始终显示 0
- `routes/admin.js:1615-1635`：`GET /api/admin/bullying/:id` 中 `involvedUsers`/`contentIds` 增加字符串 JSON 兼容解析，防止 `tryParse` 偶发失败时 `Array.isArray` 为 false 导致返回空数组。
- `admin.html` 详情弹窗 `showBullyingDetail()` 和处理弹窗 `openProcessWindow()` 增加降级显示：若 `involvedUserDetails` 为空但 `involvedUsers` 有数据，直接使用原始数据渲染。

| 改动 | 文件 | 说明 |
|------|------|------|
| 自动话题识别 | `routes/posts.js` | 发帖 `#话题` 自动创建/关联讨论区，设置 `discussionId` 并同步评论 |
| 涉事搜索防抖 | `bully.html` | doInvolvedSearch 回调检查输入框内容，防止异步重新展开 |
| 确认弹窗异常 | `bully.html` | confirmPostId try/finally + 反斜杠转义 |
| 紧急模式清空 | `bully.html` | applyVictimNameField 不清空紧急模式输入框 |
| 霸凌详情健壮 | `routes/admin.js` + `admin.html` | 兼容字符串 JSON + 前端降级显示 |
## 图谱参考

本项目使用 graphify 构建了代码知识图谱（位于 `graphify-out/`），包含 **679 个节点**、**1128 条边**、**41 个社区**（最近一次为 `--code-only` 重建，仅索引代码、未做 LLM 语义提取，社区名为占位 `Community N`）。在编辑代码前，建议先查看此图谱以理解整体架构和模块间关系。

### 图谱文件说明

| 文件 | 说明 |
|------|------|
| `graphify-out/graph.html` | 交互式图谱（浏览器直接打开），可视化所有节点与社区 |
| `graphify-out/graph.json` | 原始图谱数据（NetworkX 格式），供程序化查询 |
| `graphify-out/GRAPH_REPORT.md` | 审计报告含枢纽节点、意外连接、建议探索问题 |

### 使用方式

1. **查看交互图谱**：用浏览器打开 `graphify-out/graph.html`，浏览节点和社区结构。
2. **查询图谱**（CLI）：`graphify query "<问题>"` — 基于已有图谱回答，无需重建。
3. **增量更新**：修改代码后运行 `graphify . --update`，仅重新提取变更文件。
4. **全量重建**：`graphify .`（移除 `graphify-out/graph.json` 后执行）。
5. **无 LLM Key 时**：`graphify . --code-only` 仅用本地 AST 索引代码（跳过文档/图片语义提取），可正常生成 `graph.json` / `graph.html` / `GRAPH_REPORT.md`；社区名将为占位 `Community N`。后端支持 `OPENAI_BASE_URL`+`OPENAI_API_KEY`（OpenAI 兼容，如火山方舟）后可做语义命名。

### 关键枢纽节点

| 节点 | 度 | 作用 |
|------|-----|------|
| `broadcastSSE()` | 39 | SSE 实时推送中枢 — 几乎所有写操作都调用它 |
| `getDb()` | 28 | 数据库连接入口 |
| `dropAndInsert()` | 27 | 全表替换写入模式 |
| `verifySignedToken()` | 21 | Token 签名校验 — 认证核心 |
| `getClientIP()` | 13 | 客户端 IP 获取工具 |
| `check()` (敏感词) | 10 | 敏感词检测 |
| `verifyUserToken()` | 10 | 用户 Token 验证 |

### 建议探索

图谱中最值得探索的问题：**为什么 `broadcastSSE()` 会连接 14 个不同的社区？**
答案：`broadcastSSE()` 是系统唯一的实时推送中枢（`lib/sse.js`），被所有业务模块（帖子、通知、投票、QA、讨论区、捡漏拍卖等）依赖，是代码库中耦合度最高的函数。

---

## 9. 变更记录（Changelog）

> 本节记录本项目的非正式改动，便于后续 Agent 快速对齐。

### 2026-07-14 · 密语接收弹窗层级修复 + 积分入口与积分页重做

**Bug 修复：`#whisperIncomingOverlay` 被通知弹窗覆盖**
- 现象：收到密语（whisper）时，接收弹窗有时被「校园通知」弹窗（`notifOverlay`）挡住，用户看不到。
- 根因：`index.html` 中 `#whisperIncomingOverlay` 没有显式 `z-index`，继承自 `.modal-overlay` 的 `999`；而 `notifOverlay` / `announcementOverlay` 用 `z-index:1000`。并且 `checkNotifBadge()` 在任意 `noticeUpdate` SSE 事件（密语到达也会触发）后，若用户有 T0 通知会自动弹出 `notifOverlay`，恰好盖住密语弹窗。
- 修复：`index.html` 的 `#whisperIncomingOverlay` 增加内联 `z-index:10000`（高于所有其它弹窗）。已用 Playwright 验证：用户存在 T0 通知且同时收到密语时，密语弹窗正确置顶显示。

**积分（Credit）入口新增**
- `index.html`：左侧导航新增「我的积分」项（`<li id="sideNavCredit">`），紧接「安全中心」之后；在登录态刷新函数（`login-update`）中同步写入积分数值。顶部 `#topUserCredit` 原本已存在。
- `user.html`：个人主页 `profile-actions` 新增「我的积分」按钮（`#openCreditBtn`，`.btn-credit` 样式），点击跳转 `credit.html`。`renderUser` 在查看**本人**主页时把 `#userCreditInline` 设为真实积分（来自 `/api/user/me`），他人主页显示公开资料中的积分（公开接口 `/api/users/:id` 不返回 credit，故为 0）。

**`credit.html` 视觉重做（最小化 / 现代风）**
- 背景：暖色砖墙（`radial-gradient` + `repeating-linear-gradient`）+ 半透明卡片，契合项目整体暖色调。
- 交互：卡片进场 `rise-in` 动画（错落 `nth-child` 延迟）；余额 `count-up`（`animateCount`）；兑换结果「已兑换 ✅」按钮态 + 微动效。
- 逻辑保持：保留全部既有 JS —— `loadCredit`、`renderCredit`、`animateCount`、`doRedeem`、`luhnModN` 卡密校验、`showResult`/`clearResult`，以及 `/api/user/me`、`/api/user/credit-logs`、`/api/user/redeem-credit` 调用。
- CTA：兑换引导按钮指向 `https://www.kufaka.com/shop/2XLA5BYC/2niwrg`。

**图谱更新提示**：本次改动涉及 `index.html` / `user.html` / `credit.html` 三处前端文件，建议在提交后运行 `graphify . --update`（或 `graphify . --code-only`）刷新 `graphify-out/`。

### 会话 5 — 2026-07-14 · Credit 页面重设计 + 首页 Credit 按钮

**Credit 页面重设计 `credit.html`**
- 推翻旧砖墙背景设计，采用新设计语言：浅灰背景 `#F6F5F3`、白色表面卡片、8px 圆角、`Noto Sans SC` 字体，与 `user.html` 风格一致。
- 保持全部既有 JS 功能：`loadCredit`、`renderCredit`、`animateCount`（数值滚动动画）、`doRedeem`（卡密兑换）、`luhnModN` 前端校验。
- 布局：sticky 顶栏（品牌 + 返回按钮）→ Hero 余额卡片（渐变光晕、圆形图标、大号 tabular 数字、CTA 按钮）→ 兑换卡密卡片 → 流水记录卡片 → 底部说明区域。
- 响应式：`max-width: 640px` 内容区，移动端适配 padding/字号。

**首页 Credit 按钮 `index.html`**
- `.action-btns` 中 hamburger 按钮后新增 Credits 按钮：金黄色 `var(--brand-gold)` 背景，显示积分余额，点击新窗打开 `credit.html`。
- `updateUserBar()` 中同步刷新 `#actionBarCredit`，覆盖登录态切换、签到后刷新等场景。

### 会话 6 — 2026-07-14 · 悄悄话重设计 + 人机验证优化 + 登录刷新

**Task 1：悄悄话发送窗口重设计**
- 推翻旧暖色胶带风格，采用全新扁平现代化设计：
  - 纯白卡片圆角 `16px`、毛玻璃模糊背景（`.whisper-modal-overlay` `backdrop-filter: blur(4px)`）
  - 粉红主题色（`#e91e63`）点缀输入框 focus 边框和发送按钮
  - 搜索输入框圆角 `12px`，focus 时边框变色过渡
  - 搜索结果显示四类分类标题（匹配账号/匹配昵称/匹配UID/匹配姓名），每项带错落 `stagger` 动画（每项延迟 30ms）
  - 已通过智学认证的用户显示绿色 ✅ 已认证徽标
  - 选中用户区域圆角 `12px`、浅粉背景、头像预览
  - 弹窗打开 `whisperIn` 动画（`scale(0.92) → scale(1)` + `translateY(16px) → 0`，`cubic-bezier(0.16,1,0.3,1)`）
  - 发送按钮 hover 上移 + 阴影；active 回弹
- 删除旧的 `.tape` 胶带装饰、`fadeSlideIn` 动画
- 影响文件：`index.html`（HTML + CSS + JS）

**Task 2：登录后硬刷新**
- `doUserLogin()` / `doUserRegister()` / `doZhixueLogin()` 三个成功分支全部改为 `window.top.location.reload(true)`，实现 Ctrl+Shift+R 级别的完全硬刷新（清缓存重载全部资源）
- 移除旧的 toast 提示、信任浏览器弹窗、公告检查等页面内操作（刷新后由新页面自动处理）
- 影响文件：`index.html`

**Task 3：人机验证通过一次免二次验证**
- 引入 `_humanVerified` 全局标志 + `sessionStorage` 持久化（页面刷新后仍保持）
- 首次滑块验证成功后 `_humanVerified = true`，写入 `sessionStorage`
- `showPostCaptchaModal()` 检测 `_humanVerified = true` 时直接调 grant 拿 token → 提交，跳过滑块 UI
- Bot-testing 模式同步设置 `_humanVerified`
- 影响文件：`index.html`

**API 增强**：用户搜索 `/api/users/search` 返回结果增加 `zhixueStatus` 和 `certRealName` 字段，供前端展示认证状态。
- 影响文件：`routes/user.js`

### 会话 7 — 2026-07-14 · 修复智学登录认证 + 搜索匹配认证姓名

**Bug 1：智学网账号密码登录失败 & 管理页用户详情缺失智学信息**

| 修复点 | 文件 | 改动 |
|--------|------|------|
| 1a 登录密码校验 | `routes/user.js:272` | 解密 `user.zhixuePassword` 后与用户输入的智学密码进行字符串比较（原代码误用 `verifyPassword` 对 campus-wall 的 PBKDF2 哈希做校验） |
| 1b 审核清空密码 | `routes/admin.js:700` | 删除 `zhixuePassword = null`，保留加密的智学密码供后续登录使用 |
| 1c 管理详情弹窗 | `admin.html:4522-4526` | 在「同学认证信息」区块追加智学账号/密码显示（仅 `zhixueCertType === 'zhixue'` 时渲染） |

**Bug 2：搜索无法匹配同学认证姓名**
- `routes/user.js:1010-1014`：解密 `certRealName` 后再与搜索词比较（原代码对密文做 includes 永不相符）；同时补充 `zhixueManualName` 搜索，覆盖手动认证场景。

**附加修复**
- `routes/user.js:262`：`zhixueUsername` 在 DB 中以 Number 存储，登录时用 `String()` 统一转字符串再比较，修复类型不匹配导致用户找不到
- `routes/user.js:273-282`：当 `zhixuePassword` 为 null（旧版代码审核清空导致）时，将用户输入的密码加密存储并放行登录，实现自动恢复
- `lib/middleware.js:123,139-145`：将 `password` / `zhixuePassword` / `oldPwd` / `newPwd` 等密码字段加入 `inputSanitize` 白名单，防止特殊字符被静默清除
