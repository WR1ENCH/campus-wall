# Graph Report - campus-wall-dev_x  (2026-07-14)

## Corpus Check
- 49 files · ~145,007 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 794 nodes · 1240 edges · 49 communities (46 shown, 3 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6452d73a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- admin.js
- posts.js
- penalty.js
- system.js
- user.js
- notices.js
- package.json
- db.js
- discussions.js
- dropAndInsert
- pickup.js
- getDb
- server.js
- votes.js
- tabBar
- qa.js
- maintenance.js
- notice.js
- auth.js
- verifySignedToken
- middleware.js
- student-council.js
- crypto.js
- updateRow
- login.js
- insertRow
- state.js
- SpaRouter
- index.js
- crypto_words.js
- cache.js
- create_icons.py
- deleteSyncedDiscComment
- changeCredit
- addLoginLog
- pushUserNotice
- hasAdmins
- broadcastSSE
- agent-dev — Campus Wall 开发文档（AI Agent 上手指南）
- 会话 1 — 2026-07-12
- 3. 后端架构
- 校园墙微信小程序
- 14. 通知系统深度分析：自动触发通知
- 6. 前端架构（SPA）
- 11. 运行 / 部署 / 维护
- 图谱参考
- 4. 数据模型（db.js — SQLite 表）

## God Nodes (most connected - your core abstractions)
1. `broadcastSSE()` - 41 edges
2. `getDb()` - 29 edges
3. `dropAndInsert()` - 29 edges
4. `📌 校园墙 (Campus Wall)` - 22 edges
5. `verifySignedToken()` - 21 edges
6. `agent-dev — Campus Wall 开发文档（AI Agent 上手指南）` - 19 edges
7. `5. API 参考（按功能模块分组）` - 17 edges
8. `getClientIP()` - 13 edges
9. `verifyUserToken()` - 12 edges
10. `check()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writePosts()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `writeVotes()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/pickup.js → lib/sse.js

## Import Cycles
- None detected.

## Communities (49 total, 3 thin omitted)

### Community 0 - "admin.js"
Cohesion: 0.04
Nodes (15): adminRateLimit, { broadcastSSE }, { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames }, { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist }, crypto, DATA_DIR, db, fs (+7 more)

### Community 1 - "posts.js"
Cohesion: 0.09
Nodes (19): { broadcastSSE }, { captchaStore, postRateLimit }, { check: checkBullyingNames }, { check: checkSensitive }, db, deleteSyncedDiscComment(), { getClientIP }, incUserPostCount() (+11 more)

### Community 2 - "penalty.js"
Cohesion: 0.07
Nodes (33): migrate(), ensureUniqueIds(), { generateId, generateUID, isValidIdFormat, logIdAssignment }, needsMigration(), crypto, fs, generateId(), generateUID() (+25 more)

### Community 3 - "system.js"
Cohesion: 0.07
Nodes (19): cache, computeHotness(), db, getCachedHotness(), { onlineUsers }, recompute(), onlineUsers, { broadcastSSE } (+11 more)

### Community 4 - "user.js"
Cohesion: 0.06
Nodes (14): { broadcastSSE }, { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX }, { check: checkBullyingNames }, { check: checkSensitive }, cleanupQrCodes(), db, deleteSyncedDiscComment(), { getClientIP } (+6 more)

### Community 5 - "notices.js"
Cohesion: 0.07
Nodes (24): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { requireAdmin }, { verifySignedToken, verifyUserToken }, writeNotices(), writeVotes() (+16 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (30): acorn, better-sqlite3, compression, cookie-parser, cors, express, allowScripts, better-sqlite3@11.10.0 (+22 more)

### Community 7 - "db.js"
Cohesion: 0.07
Nodes (4): cache, Database, { generateId }, path

### Community 8 - "discussions.js"
Cohesion: 0.06
Nodes (25): addName(), check(), DATA_DIR, ensureDir(), fs, getAll(), loadNames(), NAMES_FILE (+17 more)

### Community 9 - "dropAndInsert"
Cohesion: 0.07
Nodes (27): addDeletedItem(), dropAndInsert(), writeAdmins(), writeAppeals(), writeApps(), writeBullying(), writeCreditCards(), writeCreditLogs() (+19 more)

### Community 10 - "pickup.js"
Cohesion: 0.09
Nodes (18): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, { createReport }, db, { getClientIP }, getOrCreateAuction() (+10 more)

### Community 11 - "getDb"
Cohesion: 0.10
Nodes (24): addIdInput(), all(), allSql(), countRows(), getById(), getDb(), getPostCount(), getPosts() (+16 more)

### Community 12 - "server.js"
Cohesion: 0.09
Nodes (19): sseClients, app, compression, cookieParser, cors, db, { ensureUniqueIds }, envPath (+11 more)

### Community 13 - "votes.js"
Cohesion: 0.06
Nodes (28): { broadcastSSE }, db, emitUserNotice(), FEATURE_LABELS, FEATURES, { generateId }, getActivePunishment(), getReportedContent() (+20 more)

### Community 14 - "tabBar"
Cohesion: 0.11
Nodes (18): pages, sitemapLocation, tabBar, backgroundColor, borderStyle, color, list, selectedColor (+10 more)

### Community 15 - "qa.js"
Cohesion: 0.15
Nodes (17): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, { isFeatureBlocked }, readCreditLogs() (+9 more)

### Community 16 - "maintenance.js"
Cohesion: 0.27
Nodes (13): createTestKey(), crypto, db, deleteTestKey(), generateTestKey(), getMaintenanceData(), isBotTesting(), listTestKeys() (+5 more)

### Community 17 - "notice.js"
Cohesion: 0.32
Nodes (11): closeDetail(), fetchAnnouncement(), fetchCertInfo(), fetchNotices(), filterNotices(), loadAll(), mdToHtml(), onLoad() (+3 more)

### Community 18 - "auth.js"
Cohesion: 0.15
Nodes (13): readAdmins(), readDiscussions(), readLogs(), getClientIP(), rateLimitLogin(), checkAdminRateLimit(), addLoginLog(), { broadcastSSE } (+5 more)

### Community 19 - "verifySignedToken"
Cohesion: 0.15
Nodes (12): captchaGrantLimit, captchaStore, cardCreateLimits, loginFailures, postRateLimit, qrCodeStore, redeemRateLimit, { captchaStore } (+4 more)

### Community 20 - "middleware.js"
Cohesion: 0.18
Nodes (13): verifySignedToken(), verifyUserToken(), createCheckMaintenance(), { getClientIP }, inputSanitize(), { loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS }, recordLoginFail(), requireAdmin() (+5 more)

### Community 21 - "student-council.js"
Cohesion: 0.12
Nodes (15): CERT_ENC_KEY, crypto, decryptCert(), encryptCert(), getDisplayZhixueStatus(), hashPassword(), makeToken(), makeUserToken() (+7 more)

### Community 22 - "crypto.js"
Cohesion: 0.06
Nodes (30): 10. 霸凌举报, 11. 管理后台, 12. 人机防御, 13. 安全防护, 14. Credit, 1. 前台主页面, 2. 发帖功能, 3. 帖子详情与评论 (+22 more)

### Community 23 - "updateRow"
Cohesion: 0.25
Nodes (9): deleteRow(), invalidateCache(), softDeletePost(), toSqlValue(), updateAppeal(), updatePost(), updatePunishment(), updateRow() (+1 more)

### Community 24 - "login.js"
Cohesion: 0.43
Nodes (4): handleScanResult(), pollStatus(), scanQrCode(), submitManualToken()

### Community 25 - "insertRow"
Cohesion: 0.29
Nodes (7): addUserNotification(), addWhisper(), insertAppeal(), insertPost(), insertPunishment(), insertRow(), insertUser()

### Community 26 - "state.js"
Cohesion: 0.12
Nodes (17): 5.10 统一举报 / 处罚 / 申诉 / 霸凌（reports/penalty/system/admin）, 5.11 后台管理 — 用户 / 内容管理（admin.js）, 5.12 后台管理 — 安全 / 敏感词（admin.js）, 5.13 后台管理 — 反馈 / 霸凌 / 认证审核（admin.js）, 5.14 后台管理 — 积分卡密 / 报表（admin.js，多数需超级）, 5.15 后台管理 — 通知发布 / 维护（admin.js + maintenance.js）, 5.16 系统 / 通用（system.js + maintenance.js + slider）, 5.1 管理员引导与认证（auth.js） (+9 more)

### Community 28 - "index.js"
Cohesion: 0.47
Nodes (3): checkLogin(), onLoad(), onShow()

### Community 29 - "crypto_words.js"
Cohesion: 0.33
Nodes (3): crypto, fs, path

### Community 31 - "create_icons.py"
Cohesion: 0.50
Nodes (3): draw_bell(), draw_user(), ImageDraw

### Community 32 - "deleteSyncedDiscComment"
Cohesion: 0.40
Nodes (5): addDeletedItem(), deleteSyncedDiscComment(), readDiscussionComments(), saveDeletedItem(), writeDiscussionComments()

### Community 33 - "changeCredit"
Cohesion: 0.40
Nodes (5): changeCredit(), readCreditLogs(), readUsers(), writeCreditLogs(), writeUsers()

### Community 34 - "addLoginLog"
Cohesion: 0.67
Nodes (3): addLoginLog(), readLogs(), writeLogs()

### Community 35 - "pushUserNotice"
Cohesion: 0.67
Nodes (3): pushUserNotice(), readNotices(), writeNotices()

### Community 39 - "broadcastSSE"
Cohesion: 0.15
Nodes (13): broadcastSSE(), writeAnnouncement(), writeDiscussions(), writePickupAuctions(), writePickupReports(), writePosts(), writeQAAnswers(), writeQAQuestions() (+5 more)

### Community 40 - "agent-dev — Campus Wall 开发文档（AI Agent 上手指南）"
Cohesion: 0.17
Nodes (11): 0. 一句话定位, 10. 如何新增一个后端功能（标准流程）, 12. 模块依赖速查（调用关系）, 13. 一句话速记（给 AI Agent）, 1. 技术栈与依赖, 2. 项目文件结构, 7. 微信小程序端（campus-wall-miniprogram/）, 8. 配置与环境变量（.env） (+3 more)

### Community 41 - "会话 1 — 2026-07-12"
Cohesion: 0.18
Nodes (11): 15. 会话变更日志, admin.html 修复, index.html 修复, safety.html 修复, UID 科学记数法修复, 举报列表 reporterInfo 展示, 会话 1 — 2026-07-12, 会话 2 — 2026-07-13 (+3 more)

### Community 42 - "3. 后端架构"
Cohesion: 0.20
Nodes (10): 3.1 请求生命周期（server.js）, 3.2 认证与 Token（`lib/crypto.js`）, 3.3 输入过滤（`inputSanitize`，lib/middleware.js）, 3.4 路由挂载顺序（关键约束）, 3.5 内存状态（`lib/state.js`）, 3.6 SSE 实时推送（`lib/sse.js`）, 3.7 维护模式, 3.8 数据唯一化（`lib/uniqueId.js` + `lib/idMigration.js`） (+2 more)

### Community 43 - "校园墙微信小程序"
Cohesion: 0.29
Nodes (6): 开发说明, 校园墙微信小程序, 注意事项, 目录结构, 背景样式（与网页版一致）, 颜色系统

### Community 44 - "14. 通知系统深度分析：自动触发通知"
Cohesion: 0.29
Nodes (7): 14.1 双重存储模型（核心认知）, 14.2 三条读取/下发通道（注意语义差异！）, 14.3 自动触发点完整清单, 14.4 写入模式的代码异味（给后续维护者）, 14.5 实时下发, 14.6 小结（给 AI Agent 的速记）, 14. 通知系统深度分析：自动触发通知

### Community 45 - "6. 前端架构（SPA）"
Cohesion: 0.33
Nodes (6): 6.1 页面模型, 6.2 SPA 路由（spa.js — class SpaRouter）, 6.3 前端调用后端的约定, 6.4 如何新增一个前端页面, 6.5 安全中心前端（safety.html / pages/safety.html）, 6. 前端架构（SPA）

### Community 46 - "11. 运行 / 部署 / 维护"
Cohesion: 0.40
Nodes (5): 11. 运行 / 部署 / 维护, 数据备份, 本地开发, 生产部署（PM2）, 索引维护

### Community 47 - "图谱参考"
Cohesion: 0.40
Nodes (5): 使用方式, 关键枢纽节点, 图谱参考, 图谱文件说明, 建议探索

### Community 48 - "4. 数据模型（db.js — SQLite 表）"
Cohesion: 0.67
Nodes (3): 4.1 核心业务表, 4.2 投票 / 评分 / 其它表, 4. 数据模型（db.js — SQLite 表）

## Knowledge Gaps
- **301 isolated node(s):** `fs`, `path`, `DATA_DIR`, `NAMES_FILE`, `pages/notice/notice` (+296 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `broadcastSSE()` connect `broadcastSSE` to `admin.js`, `deleteSyncedDiscComment`, `posts.js`, `pushUserNotice`, `system.js`, `notices.js`, `user.js`, `discussions.js`, `pickup.js`, `server.js`, `votes.js`, `qa.js`, `auth.js`, `student-council.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `verifySignedToken()` connect `middleware.js` to `admin.js`, `posts.js`, `system.js`, `user.js`, `notices.js`, `discussions.js`, `pickup.js`, `server.js`, `votes.js`, `qa.js`, `auth.js`, `verifySignedToken`, `student-council.js`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `getClientIP()` connect `auth.js` to `admin.js`, `posts.js`, `system.js`, `user.js`, `discussions.js`, `pickup.js`, `votes.js`, `qa.js`, `middleware.js`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `DATA_DIR` to the rest of the system?**
  _301 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `admin.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Should `posts.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Should `penalty.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._