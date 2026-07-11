# agent-dev — Campus Wall 开发文档（AI Agent 上手指南）

> 本文件是给 AI Agent / 后续开发者使用的「项目全景图」。阅读它即可直接上手编辑本项目，无需再逐一检索代码。
> 所有结论均来自对当前代码库（codegraph 索引 689 节点 / 1890 边）的实查，与 README.md 中部分已过时描述（如「JSON 文件存储」「svg-captcha」）不同，本文件以**实际代码**为准。

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

---

## 4. 数据模型（db.js — SQLite 表）

数据库文件：`data/campus.db`，WAL 模式。所有表在 `migrate()` 中 `CREATE TABLE IF NOT EXISTS` 自动建表（**无需手动迁移**）。代码统一通过 `readXxx()` / `writeXxx()` 接口访问（底层用 `dropAndInsert` 全表替换或 `insertRow` 单行插入）。

> `writeXxx` 多数走「读全表 → 改内存数组 → 全表 DELETE + 重插」模式（`dropAndInsert`）。**高频写入场景要注意性能**，但本项目数据量小，可接受。

### 4.1 核心业务表

| 表 | 关键字段 | 用途 |
|----|----------|------|
| `users` | id(PK), username(UNIQUE), password, nickname, avatar, uid, regIp, createdAt, status('active'/'banned'), postCount, bindAdminId, bindAdminRole, credit, checkedInDate, checkinStreak, banUntil, zhixueStatus, certData(加密), zhixueReviewedBy, zhixueCertType, zhixueUsername/Password, zhixueManual*, certRealName, certClassName, noticePublisher | 用户账号 + 认证 + 积分 |
| `posts` | id(PK), content, author, avatar, userId, time, type('text'/板块), deleted, pinned, images(JSON), isAnonymous, likes, likedBy, comments(JSON), commentsCount, discussionId, rotate, zIndex, deletedAt, deletedBy | 帖子 |
| `admins` | id(PK), password, name, role('admin'/'super'), createdAt | 管理员 |
| `login_logs` | id, type, account, success, ip, ua, time | 登录日志（最多保留 500 条） |
| `reports` | id, type, targetId, postId, reason, reportedBy, reporterName, createdAt, status('pending'/...), handledBy, handledAt, action | 举报 |
| `feedbacks` | id, type, description, contact, images, time, status, handledBy, handleNote | 用户反馈 |
| `bullying` | id, reporterRole, victimName, bullyType, description, involved, location, incidentTime, contact, anonymous, images, time, status, handledBy, handleNote, userId | 霸凌举报 |
| `credit_logs` | id, userId, amount, reason, createdAt | 积分变动日志 |
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
| `deleted_items` | _id, id, type, content, author, userId, deletedAt, deletedBy, extra | 软删除内容归档 |
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

### 5.3 帖子 / 评论 / 点赞 / 举报（posts.js）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/posts` | 无 | 帖子列表（支持板块/搜索/排序） |
| GET | `/api/posts/:id` | 无 | 帖子详情 |
| POST | `/api/posts` | 用户 | 发帖（频率限制 + 敏感词检测） |
| PUT | `/api/posts/:id` | 用户/管理员 | 编辑帖子 |
| DELETE | `/api/posts/:id` | 管理员 | 删除帖子 |
| DELETE | `/api/user/posts/:id` | 用户 | 删除自己的帖子 |
| POST | `/api/posts/batch-delete` | 管理员 | 批量删除 |
| POST | `/api/posts/:id/like` | 用户 | 点赞/取消 |
| GET | `/api/posts/:id/comments` | 无 | 评论列表 |
| POST | `/api/posts/:id/comments` | 用户 | 发评论 |
| DELETE | `/api/posts/:id/comments/:commentId` | 用户/管理员 | 删评论 |
| POST | `/api/posts/:id/report` | 用户 | 举报帖子 |
| POST | `/api/comments/:id/report` | 用户 | 举报评论 |
| POST | `/api/comments/batch-delete` | 管理员 | 批量删评论 |

### 5.4 用户主页 / 公开资料
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
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
| GET | `/api/pickup/auction-detail/:slot` | 无 | 某时段详情 |
| POST | `/api/pickup/bid` | 用户 | 出价 |
| POST | `/api/pickup/report-content/:bidId` | 用户 | 举报内容 |
| GET | `/api/admin/pickup/bids` | 管理员 | 后台出价列表 |
| GET | `/api/admin/pickup/reports` | 管理员 | 后台举报列表 |
| POST | `/api/admin/pickup/review/:bidId` | 管理员 | 审核出价 |
| POST | `/api/admin/pickup/report-action/:reportId` | 管理员 | 处理举报 |

### 5.10 举报 / 反馈 / 霸凌（posts/system/admin）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/reports` | 用户 | 提交举报 |
| POST | `/api/feedback` | 用户 | 提交反馈 |
| POST | `/api/bullying-report` | 用户 | 霸凌举报 |
| GET | `/api/admin/reports` | 管理员 | 举报列表 |
| POST | `/api/admin/reports/:id/handle` | 管理员 | 处理举报 |
| PUT | `/api/admin/reports/:id` | 管理员 | 更新举报 |
| POST | `/api/admin/reports/:id/ban-user` | 管理员 | 封禁被举报用户 |
| GET | `/api/admin/deleted-content` | 管理员 | 已删除内容 |

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
| GET | `/api/admin/bullying` | 管理员 | 霸凌举报列表 |
| GET | `/api/admin/bullying/:id` | 管理员 | 霸凌详情 |
| POST | `/api/admin/bullying/:id` | 管理员 | 更新霸凌 |
| POST | `/api/admin/bullying/:id/handle` | 管理员 | 处理霸凌 |
| GET | `/api/admin/zhixue-pending` | 管理员 | 待审智学认证 |
| GET | `/api/admin/zhixue-records` | 管理员 | 认证记录 |
| PUT | `/api/admin/zhixue/:userId/review` | 管理员 | 审核认证（通过/拒绝） |
| POST | `/api/admin/zhixue/:userId/reset` | 管理员 | 重置认证 |
| GET | `/api/admin/credit-logs` | 管理员 | 积分日志 |

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
| POST | `/api/bullying-report` | 用户 | 霸凌举报提交（system.js） |
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
- 错误 `code` 常见：`NOT_LOGIN` / `INVALID_TOKEN` / `TOKEN_EXPIRED` / `FORBIDDEN` / `MAINTENANCE` / `RATE_LIMITED` / `ALREADY_INIT`。
- 富文本渲染：引入 `marked.min.js`（CDN）做 Markdown；内容经 `inputSanitize` + 客户端转义防 XSS。
- 滑块验证码：`slider-captcha/longbow.slidercaptcha.min.js`，先 `POST /api/slider-captcha/grant` 拿 `captchaId`，用户拖动完成后提交 `captchaId` + `captchaText`。

### 6.4 如何新增一个前端页面
1. 在根目录新建 `xxx.html`（完整独立页，参考现有页面结构）。
2. 在 `pages/` 下新建 `xxx.html` 片段（仅容器 div 内容）。
3. 在 `server.js` 的 `PAGE_MAP` 增加 `'/xxx.html': 'pages/xxx.html'`。
4. 用 `<a data-spa href="/xxx.html">` 链接即可被 SPA 接管。

---

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
