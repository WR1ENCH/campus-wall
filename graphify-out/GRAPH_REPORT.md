# Graph Report - /home/wr1ench/campus-wall  (2026-07-11)

## Corpus Check
- 89 files · ~135,098 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 699 nodes · 1094 edges · 57 communities (37 shown, 20 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 167 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Admin Panel Backend
- Discussions & Sensitive Words
- User Account System
- Notices & Sensitive Content
- Frontend Pages & Concepts
- System API & Hotness
- NPM Package Dependencies
- Unique ID System & Migration
- Database Core (SQLite)
- Auth & Middleware
- Database Helpers
- Pickup Auction System
- Data Write Operations
- Server Entry & SSE
- Posts & Comments
- QA Bounty System
- Votes & Polling
- Crypto & Token Auth
- Miniprogram App Config
- State Management
- Slider Captcha
- Cache Layer
- Credit & Ecosystem
- Bullying Names System
- Student Council
- Maintenance Mode
- Miniprogram Index Page
- Miniprogram Login Page
- Miniprogram Notice Page
- Miniprogram Icons
- SPA Router
- Admin Frontend Pages
- Report & Pickup Admin
- Agreement & Legal Pages
- Screenshots Assets
- Captcha Images
- Frontend Concepts
- Server Config & Env
- Admin CSS Variables
- HTML Layout Utilities
- Page Partial Loading
- Test - ID Migration
- Test - Unique ID
- Playwright Test Deps
- Crypto Word Encryption
- Commit Messages
- CLAUDE.md & Agent Docs
- README & Project Overview
- Miniprogram README
- User Agreement Concept
- Search & Image Upload
- Anti-Bullying Concept
- Featured Content Concept
- Knowledge Base Concept
- Ecosystem Shop Concept

## God Nodes (most connected - your core abstractions)
1. `broadcastSSE()` - 39 edges
2. `getDb()` - 28 edges
3. `dropAndInsert()` - 27 edges
4. `verifySignedToken()` - 21 edges
5. `getClientIP()` - 13 edges
6. `Campus Wall Platform` - 11 edges
7. `check()` - 10 edges
8. `verifyUserToken()` - 10 edges
9. `check()` - 10 edges
10. `insertRow()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Campus Wall System` --references--> `Campus Wall Go Backend`  [INFERRED]
  . → main.go
- `writeDiscussions()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writePosts()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/discussions.js → lib/sse.js
- `writeNotices()` --calls--> `broadcastSSE()`  [EXTRACTED]
  routes/notices.js → lib/sse.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Campus Wall Core Subsystems** — posting_wall_system_concept, credit_score_system_concept, anti_bullying_whistleblowing_concept, ecosystem_shop_marketplace_concept, knowledge_base_concept, pages_admin_management_concept, notice_system_concept, featured_content_concept [EXTRACTED 1.00]
- **List Page and Detail Page File Pairs** — bully_html_bullying_whistleblowing, pages_bully_html_bullying_report, ecosystem_html_ecosystem_shop, pages_ecosystem_html_ecosystem_detail, knowledge_html_knowledge_base, pages_knowledge_html_knowledge_detail, apply_notice_html_notice_application, pages_notice_html_notice_detail [INFERRED 0.95]
- **Campus Wall Frontend Pages** — index_html_main_wall, post_html_submission, report_html_user_report, user_html_user_page, notice_html_notification, admin_html_admin_panel [INFERRED 0.95]
- **Admin Panel Loaded Partials** — admin_html_admin_panel, pages_report_html_admin_report_management, pages_user_html_admin_user_management, pages_wall_html_admin_wall_management [EXTRACTED 1.00]
- **Report and Pickup Flow** — report_html_user_report, pages_report_html_admin_report_management, post_html_submission [INFERRED 0.85]

## Communities (57 total, 20 thin omitted)

### Community 0 - "Admin Panel Backend"
Cohesion: 0.04
Nodes (14): adminRateLimit, { broadcastSSE }, { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames }, { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist }, crypto, DATA_DIR, db, fs (+6 more)

### Community 1 - "Discussions & Sensitive Words"
Cohesion: 0.06
Nodes (24): addName(), check(), DATA_DIR, ensureDir(), fs, getAll(), loadNames(), NAMES_FILE (+16 more)

### Community 2 - "User Account System"
Cohesion: 0.06
Nodes (14): { broadcastSSE }, { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX }, { check: checkBullyingNames }, { check: checkSensitive }, cleanupQrCodes(), db, deleteSyncedDiscComment(), { getClientIP } (+6 more)

### Community 3 - "Notices & Sensitive Content"
Cohesion: 0.07
Nodes (24): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { requireAdmin }, { verifySignedToken, verifyUserToken }, writeNotices(), writeVotes() (+16 more)

### Community 4 - "Frontend Pages & Concepts"
Cohesion: 0.08
Nodes (30): Anti-Bullying / Whistleblowing, apply-notice.html - Notice Application Page, Auth Bypass / Privilege Escalation Security Fix, bully.html - Bullying Whistleblowing Page, Campus Social Platform, Campus Wall Platform, commit_msg.txt - Commit Message, credit.html - Credit System Page (+22 more)

### Community 5 - "System API & Hotness"
Cohesion: 0.07
Nodes (19): cache, computeHotness(), db, getCachedHotness(), { onlineUsers }, recompute(), onlineUsers, { broadcastSSE } (+11 more)

### Community 6 - "NPM Package Dependencies"
Cohesion: 0.07
Nodes (28): acorn, better-sqlite3, compression, cookie-parser, cors, express, author, dependencies (+20 more)

### Community 7 - "Unique ID System & Migration"
Cohesion: 0.11
Nodes (23): ensureUniqueIds(), { generateId, generateUID, isValidIdFormat, logIdAssignment }, needsMigration(), crypto, fs, generateId(), generateUID(), isValidIdFormat() (+15 more)

### Community 8 - "Database Core (SQLite)"
Cohesion: 0.08
Nodes (3): cache, Database, path

### Community 9 - "Auth & Middleware"
Cohesion: 0.11
Nodes (21): readAdmins(), readLogs(), writeAdmins(), writeLogs(), getClientIP(), { getClientIP }, inputSanitize(), { loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS } (+13 more)

### Community 10 - "Database Helpers"
Cohesion: 0.10
Nodes (25): addIdInput(), all(), allSql(), countRows(), getById(), getDb(), getPostCount(), getPosts() (+17 more)

### Community 11 - "Pickup Auction System"
Cohesion: 0.10
Nodes (16): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, getOrCreateAuction(), PICKUP_SLOTS (+8 more)

### Community 12 - "Data Write Operations"
Cohesion: 0.09
Nodes (23): addDeletedItem(), dropAndInsert(), writeApps(), writeBullying(), writeCreditCards(), writeCreditLogs(), writeDeletedItems(), writeDiscussionComments() (+15 more)

### Community 13 - "Server Entry & SSE"
Cohesion: 0.09
Nodes (19): sseClients, app, compression, cookieParser, cors, db, { ensureUniqueIds }, envPath (+11 more)

### Community 14 - "Posts & Comments"
Cohesion: 0.11
Nodes (16): { broadcastSSE }, { captchaStore, postRateLimit }, { check: checkBullyingNames }, { check: checkSensitive }, db, deleteSyncedDiscComment(), { getClientIP }, incUserPostCount() (+8 more)

### Community 15 - "QA Bounty System"
Cohesion: 0.10
Nodes (12): { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, readSC(), readUsers(), { requireAdmin } (+4 more)

### Community 16 - "Votes & Polling"
Cohesion: 0.12
Nodes (15): CERT_ENC_KEY, crypto, decryptCert(), encryptCert(), getDisplayZhixueStatus(), hashPassword(), makeToken(), makeUserToken() (+7 more)

### Community 17 - "Crypto & Token Auth"
Cohesion: 0.11
Nodes (18): pages, sitemapLocation, tabBar, backgroundColor, borderStyle, color, list, selectedColor (+10 more)

### Community 18 - "Miniprogram App Config"
Cohesion: 0.16
Nodes (16): { broadcastSSE }, changeCredit(), { check: checkBullyingNames }, { check: checkSensitive }, db, { getClientIP }, readCreditLogs(), readQAAnswers() (+8 more)

### Community 19 - "State Management"
Cohesion: 0.14
Nodes (14): broadcastSSE(), writeAnnouncement(), writeDiscussions(), writePickupAuctions(), writePickupReports(), writePosts(), writeQAAnswers(), writeQAQuestions() (+6 more)

### Community 20 - "Slider Captcha"
Cohesion: 0.27
Nodes (13): createTestKey(), crypto, db, deleteTestKey(), generateTestKey(), getMaintenanceData(), isBotTesting(), listTestKeys() (+5 more)

### Community 21 - "Cache Layer"
Cohesion: 0.29
Nodes (13): Admin Panel, Tabbed Admin Interface, Campus Wall Go Backend, Campus Wall System, Main Wall Feed, Notification Page, HTML Partial Loading Pattern, Admin Report Management Partial (+5 more)

### Community 22 - "Credit & Ecosystem"
Cohesion: 0.17
Nodes (12): verifySignedToken(), verifyUserToken(), createCheckMaintenance(), requireAdmin(), captchaStore, requireAdmin(), { captchaStore }, db (+4 more)

### Community 23 - "Bullying Names System"
Cohesion: 0.32
Nodes (11): closeDetail(), fetchAnnouncement(), fetchCertInfo(), fetchNotices(), filterNotices(), loadAll(), mdToHtml(), onLoad() (+3 more)

### Community 24 - "Student Council"
Cohesion: 0.18
Nodes (12): addUserNotification(), addWhisper(), deleteRow(), insertPost(), insertRow(), insertUser(), invalidateCache(), softDeletePost() (+4 more)

### Community 25 - "Maintenance Mode"
Cohesion: 0.36
Nodes (7): check(), { chromium }, crypto, db, main(), reports2Id(), tomorrow()

### Community 26 - "Miniprogram Index Page"
Cohesion: 0.43
Nodes (4): handleScanResult(), pollStatus(), scanQrCode(), submitManualToken()

### Community 27 - "Miniprogram Login Page"
Cohesion: 0.29
Nodes (6): captchaGrantLimit, cardCreateLimits, loginFailures, postRateLimit, qrCodeStore, redeemRateLimit

### Community 29 - "Miniprogram Icons"
Cohesion: 0.47
Nodes (3): checkLogin(), onLoad(), onShow()

### Community 30 - "SPA Router"
Cohesion: 0.33
Nodes (3): crypto, fs, path

### Community 32 - "Report & Pickup Admin"
Cohesion: 0.50
Nodes (3): draw_bell(), draw_user(), ImageDraw

### Community 33 - "Agreement & Legal Pages"
Cohesion: 0.40
Nodes (5): addDeletedItem(), deleteSyncedDiscComment(), readDiscussionComments(), saveDeletedItem(), writeDiscussionComments()

### Community 34 - "Screenshots Assets"
Cohesion: 0.40
Nodes (5): changeCredit(), readCreditLogs(), readUsers(), writeCreditLogs(), writeUsers()

### Community 35 - "Captcha Images"
Cohesion: 0.67
Nodes (3): addLoginLog(), readLogs(), writeLogs()

### Community 36 - "Frontend Concepts"
Cohesion: 0.67
Nodes (3): pushUserNotice(), readNotices(), writeNotices()

## Knowledge Gaps
- **226 isolated node(s):** `fs`, `path`, `DATA_DIR`, `NAMES_FILE`, `pages/notice/notice` (+221 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `broadcastSSE()` connect `State Management` to `Admin Panel Backend`, `Agreement & Legal Pages`, `Discussions & Sensitive Words`, `Notices & Sensitive Content`, `Frontend Concepts`, `System API & Hotness`, `User Account System`, `Auth & Middleware`, `Pickup Auction System`, `Server Entry & SSE`, `Posts & Comments`, `QA Bounty System`, `Votes & Polling`, `Miniprogram App Config`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `verifySignedToken()` connect `Credit & Ecosystem` to `Admin Panel Backend`, `Discussions & Sensitive Words`, `User Account System`, `Notices & Sensitive Content`, `System API & Hotness`, `Auth & Middleware`, `Pickup Auction System`, `Server Entry & SSE`, `Posts & Comments`, `QA Bounty System`, `Votes & Polling`, `Miniprogram App Config`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getClientIP()` connect `Auth & Middleware` to `Admin Panel Backend`, `Discussions & Sensitive Words`, `User Account System`, `System API & Hotness`, `Pickup Auction System`, `Posts & Comments`, `QA Bounty System`, `Miniprogram App Config`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `DATA_DIR` to the rest of the system?**
  _228 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Panel Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.03636363636363636 - nodes in this community are weakly interconnected._
- **Should `Discussions & Sensitive Words` be split into smaller, more focused modules?**
  _Cohesion score 0.06401137980085349 - nodes in this community are weakly interconnected._
- **Should `User Account System` be split into smaller, more focused modules?**
  _Cohesion score 0.062388591800356503 - nodes in this community are weakly interconnected._