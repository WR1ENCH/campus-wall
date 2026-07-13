# Graph Report - .  (2026-07-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 679 nodes · 1128 edges · 41 communities (37 shown, 4 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d4c3d50`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pickup.js
- admin.js
- system.js
- discussions.js
- votes.js
- user.js
- package.json
- db.js
- dropAndInsert
- posts.js
- getDb
- tabBar
- server.js
- qa.js
- notices.js
- penalty.js
- middleware.js
- broadcastSSE
- maintenance.js
- auth.js
- notice.js
- verifySignedToken
- crypto.js
- student-council.js
- updateRow
- state.js
- login.js
- insertRow
- SpaRouter
- index.js
- crypto_words.js
- cache.js
- create_icons.py
- deleteSyncedDiscComment
- changeCredit
- zhixue.js
- addLoginLog
- pushUserNotice
- hasAdmins

## God Nodes (most connected - your core abstractions)
1. `broadcastSSE()` - 41 edges
2. `getDb()` - 29 edges
3. `dropAndInsert()` - 29 edges
4. `verifySignedToken()` - 21 edges
5. `getClientIP()` - 13 edges
6. `verifyUserToken()` - 12 edges
7. `check()` - 10 edges
8. `insertRow()` - 10 edges
9. `generateId()` - 10 edges
10. `check()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `writeDiscussions()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `writeVotes()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/pickup.js → lib/sse.js

## Import Cycles
- None detected.

## Communities (41 total, 4 thin omitted)

### Community 0 - "pickup.js"
Cohesion: 0.05
Nodes (44): migrate(), ensureUniqueIds(), { generateId, generateUID, isValidIdFormat, logIdAssignment }, needsMigration(), crypto, fs, generateId(), generateUID() (+36 more)

### Community 1 - "admin.js"
Cohesion: 0.04
Nodes (15): adminRateLimit, { broadcastSSE }, { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames }, { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist }, crypto, DATA_DIR, db, fs (+7 more)

### Community 2 - "system.js"
Cohesion: 0.06
Nodes (32): addName(), check(), DATA_DIR, ensureDir(), fs, getAll(), loadNames(), NAMES_FILE (+24 more)

### Community 3 - "discussions.js"
Cohesion: 0.05
Nodes (27): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, commentDeleteLimit, db, { getClientIP }, { isFeatureBlocked }, uniqueId (+19 more)

### Community 4 - "votes.js"
Cohesion: 0.06
Nodes (29): { broadcastSSE }, db, durationText(), emitUserNotice(), FEATURE_LABELS, FEATURES, { generateId }, getActivePunishment() (+21 more)

### Community 5 - "user.js"
Cohesion: 0.06
Nodes (14): { broadcastSSE }, { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX }, { check: checkBullyingNames }, { check: checkSensitive }, cleanupQrCodes(), db, deleteSyncedDiscComment(), { getClientIP } (+6 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (30): acorn, better-sqlite3, compression, cookie-parser, cors, express, allowScripts, better-sqlite3@11.10.0 (+22 more)

### Community 7 - "db.js"
Cohesion: 0.07
Nodes (4): cache, Database, { generateId }, path

### Community 8 - "dropAndInsert"
Cohesion: 0.08
Nodes (25): addDeletedItem(), dropAndInsert(), writeAppeals(), writeApps(), writeBullying(), writeCreditCards(), writeCreditLogs(), writeDeletedItems() (+17 more)

### Community 9 - "posts.js"
Cohesion: 0.10
Nodes (18): { broadcastSSE }, { captchaStore, postRateLimit }, { check: checkBullyingNames }, { check: checkSensitive }, db, deleteSyncedDiscComment(), { getClientIP }, incUserPostCount() (+10 more)

### Community 10 - "getDb"
Cohesion: 0.10
Nodes (24): addIdInput(), all(), allSql(), countRows(), getById(), getDb(), getPostCount(), getPosts() (+16 more)

### Community 11 - "tabBar"
Cohesion: 0.11
Nodes (18): pages, sitemapLocation, tabBar, backgroundColor, borderStyle, color, list, selectedColor (+10 more)

### Community 12 - "server.js"
Cohesion: 0.11
Nodes (17): sseClients, app, compression, cookieParser, cors, db, { ensureUniqueIds }, envPath (+9 more)

### Community 13 - "qa.js"
Cohesion: 0.15
Nodes (17): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, { isFeatureBlocked }, readCreditLogs() (+9 more)

### Community 14 - "notices.js"
Cohesion: 0.12
Nodes (8): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { requireAdmin }, { verifySignedToken, verifyUserToken }, writeNotices(), writeVotes()

### Community 15 - "penalty.js"
Cohesion: 0.14
Nodes (7): db, { generateId, logIdAssignment }, getEvidenceFromReport(), penalty, readReports(), { requireAdmin, requireSuper }, { verifyUserToken }

### Community 16 - "middleware.js"
Cohesion: 0.18
Nodes (10): getClientIP(), { getClientIP }, inputSanitize(), { loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS }, rateLimitLogin(), recordLoginFail(), requireSuper(), sanitizeString() (+2 more)

### Community 17 - "broadcastSSE"
Cohesion: 0.14
Nodes (14): broadcastSSE(), writeAnnouncement(), writeDiscussions(), writePickupAuctions(), writePickupReports(), writePosts(), writeQAAnswers(), writeQAQuestions() (+6 more)

### Community 18 - "maintenance.js"
Cohesion: 0.27
Nodes (13): createTestKey(), crypto, db, deleteTestKey(), generateTestKey(), getMaintenanceData(), isBotTesting(), listTestKeys() (+5 more)

### Community 19 - "auth.js"
Cohesion: 0.19
Nodes (12): readAdmins(), readLogs(), writeAdmins(), writeLogs(), verifyPassword(), addLoginLog(), { broadcastSSE }, { getClientIP } (+4 more)

### Community 20 - "notice.js"
Cohesion: 0.32
Nodes (11): closeDetail(), fetchAnnouncement(), fetchCertInfo(), fetchNotices(), filterNotices(), loadAll(), mdToHtml(), onLoad() (+3 more)

### Community 21 - "verifySignedToken"
Cohesion: 0.18
Nodes (11): verifySignedToken(), verifyUserToken(), createCheckMaintenance(), requireAdmin(), requireAdmin(), { captchaStore }, db, maintenance (+3 more)

### Community 22 - "crypto.js"
Cohesion: 0.27
Nodes (9): CERT_ENC_KEY, crypto, decryptCert(), encryptCert(), getDisplayZhixueStatus(), hashPassword(), makeToken(), makeUserToken() (+1 more)

### Community 23 - "student-council.js"
Cohesion: 0.20
Nodes (5): { broadcastSSE }, { captchaStore }, db, maintenance, { signToken, verifySignedToken, hashPassword, verifyPassword }

### Community 24 - "updateRow"
Cohesion: 0.25
Nodes (9): deleteRow(), invalidateCache(), softDeletePost(), toSqlValue(), updateAppeal(), updatePost(), updatePunishment(), updateRow() (+1 more)

### Community 25 - "state.js"
Cohesion: 0.25
Nodes (7): captchaGrantLimit, captchaStore, cardCreateLimits, loginFailures, postRateLimit, qrCodeStore, redeemRateLimit

### Community 26 - "login.js"
Cohesion: 0.43
Nodes (4): handleScanResult(), pollStatus(), scanQrCode(), submitManualToken()

### Community 27 - "insertRow"
Cohesion: 0.29
Nodes (7): addUserNotification(), addWhisper(), insertAppeal(), insertPost(), insertPunishment(), insertRow(), insertUser()

### Community 29 - "index.js"
Cohesion: 0.47
Nodes (3): checkLogin(), onLoad(), onShow()

### Community 30 - "crypto_words.js"
Cohesion: 0.33
Nodes (3): crypto, fs, path

### Community 32 - "create_icons.py"
Cohesion: 0.50
Nodes (3): draw_bell(), draw_user(), ImageDraw

### Community 33 - "deleteSyncedDiscComment"
Cohesion: 0.40
Nodes (5): addDeletedItem(), deleteSyncedDiscComment(), readDiscussionComments(), saveDeletedItem(), writeDiscussionComments()

### Community 34 - "changeCredit"
Cohesion: 0.40
Nodes (5): changeCredit(), readCreditLogs(), readUsers(), writeCreditLogs(), writeUsers()

### Community 36 - "addLoginLog"
Cohesion: 0.67
Nodes (3): addLoginLog(), readLogs(), writeLogs()

### Community 37 - "pushUserNotice"
Cohesion: 0.67
Nodes (3): pushUserNotice(), readNotices(), writeNotices()

## Knowledge Gaps
- **204 isolated node(s):** `fs`, `path`, `DATA_DIR`, `NAMES_FILE`, `pages/notice/notice` (+199 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `broadcastSSE()` connect `broadcastSSE` to `pickup.js`, `admin.js`, `deleteSyncedDiscComment`, `discussions.js`, `votes.js`, `pushUserNotice`, `system.js`, `user.js`, `posts.js`, `server.js`, `qa.js`, `notices.js`, `auth.js`, `student-council.js`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `verifySignedToken()` connect `verifySignedToken` to `pickup.js`, `admin.js`, `system.js`, `discussions.js`, `votes.js`, `user.js`, `posts.js`, `server.js`, `qa.js`, `notices.js`, `middleware.js`, `auth.js`, `crypto.js`, `student-council.js`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getClientIP()` connect `middleware.js` to `pickup.js`, `admin.js`, `system.js`, `discussions.js`, `votes.js`, `user.js`, `posts.js`, `qa.js`, `auth.js`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `DATA_DIR` to the rest of the system?**
  _204 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pickup.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05194805194805195 - nodes in this community are weakly interconnected._
- **Should `admin.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Should `system.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05813953488372093 - nodes in this community are weakly interconnected._