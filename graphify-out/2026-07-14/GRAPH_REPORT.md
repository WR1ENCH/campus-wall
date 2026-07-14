# Graph Report - /home/wr1ench/campus-wall-dev  (2026-07-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 680 nodes · 1069 edges · 39 communities (36 shown, 3 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `facd4d45`
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

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 29 edges
2. `dropAndInsert()` - 29 edges
3. `broadcastSSE()` - 26 edges
4. `verifySignedToken()` - 18 edges
5. `verifyUserToken()` - 11 edges
6. `insertRow()` - 10 edges
7. `getClientIP()` - 10 edges
8. `generateId()` - 10 edges
9. `check()` - 8 edges
10. `updateRow()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `writeVotes()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js
- `requireAdmin()` --calls--> `verifySignedToken()`  [EXTRACTED]
  routes/posts.js → lib/crypto.js
- `_resolveAdminOrSC()` --calls--> `verifySignedToken()`  [EXTRACTED]
  routes/votes.js → lib/crypto.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/pickup.js → lib/sse.js

## Import Cycles
- None detected.

## Communities (39 total, 3 thin omitted)

### Community 0 - "admin.js"
Cohesion: 0.03
Nodes (15): adminRateLimit, { broadcastSSE }, { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames }, { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist }, crypto, DATA_DIR, db, fs (+7 more)

### Community 1 - "posts.js"
Cohesion: 0.05
Nodes (43): { broadcastSSE }, db, durationText(), emitUserNotice(), FEATURE_LABELS, FEATURES, { generateId }, getActivePunishment() (+35 more)

### Community 2 - "penalty.js"
Cohesion: 0.06
Nodes (34): migrate(), ensureUniqueIds(), { generateId, generateUID, isValidIdFormat, logIdAssignment }, needsMigration(), requireSuper(), crypto, fs, generateId() (+26 more)

### Community 3 - "system.js"
Cohesion: 0.06
Nodes (30): addName(), check(), DATA_DIR, ensureDir(), fs, getAll(), loadNames(), NAMES_FILE (+22 more)

### Community 4 - "user.js"
Cohesion: 0.06
Nodes (14): { broadcastSSE }, { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX }, { check: checkBullyingNames }, { check: checkSensitive }, cleanupQrCodes(), db, deleteSyncedDiscComment(), { getClientIP } (+6 more)

### Community 5 - "notices.js"
Cohesion: 0.07
Nodes (22): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { requireAdmin }, { verifySignedToken, verifyUserToken }, writeNotices(), writeVotes() (+14 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (30): acorn, better-sqlite3, compression, cookie-parser, cors, express, allowScripts, better-sqlite3@11.10.0 (+22 more)

### Community 7 - "db.js"
Cohesion: 0.07
Nodes (4): cache, Database, { generateId }, path

### Community 8 - "discussions.js"
Cohesion: 0.07
Nodes (10): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, commentDeleteLimit, db, discussionCreateLimit, { getClientIP }, { isFeatureBlocked } (+2 more)

### Community 9 - "dropAndInsert"
Cohesion: 0.08
Nodes (25): addDeletedItem(), dropAndInsert(), writeAppeals(), writeApps(), writeBullying(), writeCreditCards(), writeCreditLogs(), writeDeletedItems() (+17 more)

### Community 10 - "pickup.js"
Cohesion: 0.09
Nodes (17): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, { createReport }, db, { getClientIP }, getOrCreateAuction() (+9 more)

### Community 11 - "getDb"
Cohesion: 0.10
Nodes (24): addIdInput(), all(), allSql(), countRows(), getById(), getDb(), getPostCount(), getPosts() (+16 more)

### Community 12 - "server.js"
Cohesion: 0.09
Nodes (19): sseClients, app, compression, cookieParser, cors, db, { ensureUniqueIds }, envPath (+11 more)

### Community 13 - "votes.js"
Cohesion: 0.10
Nodes (12): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, { isFeatureBlocked }, readSC(), readUsers() (+4 more)

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
Cohesion: 0.21
Nodes (11): readAdmins(), readLogs(), writeAdmins(), writeLogs(), addLoginLog(), { broadcastSSE }, { getClientIP }, hasAdmins() (+3 more)

### Community 19 - "verifySignedToken"
Cohesion: 0.18
Nodes (11): verifySignedToken(), verifyUserToken(), createCheckMaintenance(), requireAdmin(), captchaStore, { captchaStore }, db, maintenance (+3 more)

### Community 20 - "middleware.js"
Cohesion: 0.21
Nodes (8): getClientIP(), { getClientIP }, inputSanitize(), { loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS }, rateLimitLogin(), recordLoginFail(), sanitizeString(), { verifySignedToken }

### Community 21 - "student-council.js"
Cohesion: 0.18
Nodes (6): verifyPassword(), { broadcastSSE }, { captchaStore }, db, maintenance, { signToken, verifySignedToken, hashPassword, verifyPassword }

### Community 22 - "crypto.js"
Cohesion: 0.27
Nodes (9): CERT_ENC_KEY, crypto, decryptCert(), encryptCert(), getDisplayZhixueStatus(), hashPassword(), makeToken(), makeUserToken() (+1 more)

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
Cohesion: 0.29
Nodes (6): captchaGrantLimit, cardCreateLimits, loginFailures, postRateLimit, qrCodeStore, redeemRateLimit

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

## Knowledge Gaps
- **206 isolated node(s):** `fs`, `path`, `DATA_DIR`, `NAMES_FILE`, `pages/notice/notice` (+201 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `broadcastSSE()` connect `posts.js` to `system.js`, `user.js`, `notices.js`, `pickup.js`, `server.js`, `votes.js`, `qa.js`, `auth.js`, `student-council.js`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `verifySignedToken()` connect `verifySignedToken` to `posts.js`, `system.js`, `user.js`, `notices.js`, `pickup.js`, `server.js`, `votes.js`, `qa.js`, `auth.js`, `middleware.js`, `student-council.js`, `crypto.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `verifyUserToken()` connect `verifySignedToken` to `posts.js`, `penalty.js`, `system.js`, `user.js`, `notices.js`, `pickup.js`, `votes.js`, `qa.js`, `crypto.js`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `DATA_DIR` to the rest of the system?**
  _206 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `admin.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03076923076923077 - nodes in this community are weakly interconnected._
- **Should `posts.js` be split into smaller, more focused modules?**
  _Cohesion score 0.054901960784313725 - nodes in this community are weakly interconnected._
- **Should `penalty.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0647342995169082 - nodes in this community are weakly interconnected._