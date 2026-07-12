# Graph Report - .  (2026-07-12)

## Corpus Check
- 86 files · ~56,603 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 398 nodes · 521 edges · 47 communities (27 shown, 20 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- SSE Real-Time Notifications
- Crypto Security
- Anti-Bullying & User Agreement
- User Authentication & Login
- Dependencies & Middleware
- Database & Hotness
- Mini-Program Config
- ID Migration
- Sensitive Words
- Bullying Names
- Maintenance
- Notice System Frontend
- Platform Features
- Ecosystem & Mini-Program
- Mini-Program Login
- Report & Safety Center
- Vote System
- Post Management
- Admin Routes
- Helper Functions
- Admin HTML Pages
- Student Council
- Discussion System
- Auth Routes
- QA System
- Captcha & Slider
- SPA Transitions
- Campus Wall Frontend Pages
- SPA Router
- User Pages
- Agreement & Legal
- Notice Admin Pages
- Ecosystem Pages
- Credit System
- Apply Notice Pages
- System Routes
- Screenshots
- Mini-Program Icons

## God Nodes (most connected - your core abstractions)
1. `Campus Wall 校园墙` - 15 edges
2. `broadcastSSE()` - 12 edges
3. `Agent Development Guide (Full Architecture)` - 12 edges
4. `verifySignedToken()` - 11 edges
5. `getMaintenanceData()` - 8 edges
6. `loadAll()` - 7 edges
7. `signToken()` - 7 edges
8. `window` - 6 edges
9. `tabBar` - 6 edges
10. `getClientIP()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Campus Wall 校园墙` --references--> `WeChat Mini-Program Client`  [INFERRED]
  README.md → campus-wall-miniprogram/README.md
- `XSS Content Sanitization` --semantically_similar_to--> `Global Input Sanitization with Whitelist`  [INFERRED] [semantically similar]
  README.md → docs_for_agent.md
- `Credit Terms (1 CNY = 100 Credit, non-reversible)` --semantically_similar_to--> `Credit Virtual Currency System`  [INFERRED] [semantically similar]
  agreement.html → README.md
- `User Knowledge Base (Dark Theme Documentation)` --references--> `Campus Wall 校园墙`  [INFERRED]
  knowledge.html → README.md
- `Landing Page with Typewriter Animation` --references--> `Campus Wall 校园墙`  [INFERRED]
  launch.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Layer Security Defense System** — readme_pbkdf2_hash, readme_token_auth, readme_xss_protection, readme_pow_protection, readme_rate_limiting, readme_sensitive_words [INFERRED 0.85]
- **User-Generated Content Features** — readme_campus_wall, notice_discussions, notice_voting, readme_credit_system [INFERRED 0.75]
- **Anti-Bullying Protection Chain** — agreement_anti_bullying, agreement_protected_list, bully_report_system, bully_draft_autosave [INFERRED 0.85]
- **Post Interaction Features** — comment_system, like_system, report_mechanism [INFERRED 0.85]
- **Content Safety Moderation** — sensitive_content_filter, anti_bullying_filter, report_mechanism [INFERRED 0.85]
- **User Identity Management** — zhixue_certification_system, admin_binding_system, profile_editing [INFERRED 0.85]
- **App Screenshots** — assets_screenshot_admin_page, assets_screenshot_index_page, assets_screenshot_post_page, assets_screenshot_user_page [EXTRACTED 1.00]
- **Tab Bar Icons** — campus_wall_miniprogram_icons_notice, campus_wall_miniprogram_icons_notice_active, campus_wall_miniprogram_icons_user, campus_wall_miniprogram_icons_user_active [INFERRED 0.85]
- **Slider Captcha Background Images** — slider_captcha_images_pic0, slider_captcha_images_pic1, slider_captcha_images_pic2, slider_captcha_images_pic3, slider_captcha_images_pic4 [EXTRACTED 1.00]

## Communities (47 total, 20 thin omitted)

### Community 0 - "SSE Real-Time Notifications"
Cohesion: 0.05
Nodes (25): verifyUserToken(), broadcastSSE(), sseClients, { broadcastSSE }, { check: checkBullyingNames }, { check: checkSensitive }, db, { requireAdmin } (+17 more)

### Community 1 - "Crypto Security"
Cohesion: 0.08
Nodes (32): CERT_ENC_KEY, crypto, decryptCert(), encryptCert(), getDisplayZhixueStatus(), hashPassword(), makeToken(), makeUserToken() (+24 more)

### Community 2 - "Anti-Bullying & User Agreement"
Cohesion: 0.06
Nodes (38): Anti-Bullying Mechanism (Zero Tolerance), Credit Terms (1 CNY = 100 Credit, non-reversible), Anti-Bullying Protected Names List, User Agreement v1.1 (2026-05-20), Draft Autosave with Leave Confirmation, Post ID Confirmation Dialog for Evidence, Platform Bullying Report System, Credit Balance & History Page (+30 more)

### Community 3 - "User Authentication & Login"
Cohesion: 0.06
Nodes (14): { broadcastSSE }, { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX }, { check: checkBullyingNames }, { check: checkSensitive }, cleanupQrCodes(), db, deleteSyncedDiscComment(), { getClientIP } (+6 more)

### Community 4 - "Dependencies & Middleware"
Cohesion: 0.07
Nodes (28): acorn, better-sqlite3, compression, cookie-parser, cors, express, author, dependencies (+20 more)

### Community 5 - "Database & Hotness"
Cohesion: 0.09
Nodes (19): cache, computeHotness(), db, getCachedHotness(), { onlineUsers }, recompute(), captchaGrantLimit, captchaStore (+11 more)

### Community 6 - "Mini-Program Config"
Cohesion: 0.11
Nodes (18): pages, sitemapLocation, tabBar, backgroundColor, borderStyle, color, list, selectedColor (+10 more)

### Community 7 - "ID Migration"
Cohesion: 0.12
Nodes (14): ensureUniqueIds(), { generateId, generateUID, isValidIdFormat, logIdAssignment }, needsMigration(), assert, { describe, it, before, after, beforeEach }, fs, path, TEST_DB (+6 more)

### Community 8 - "Sensitive Words"
Cohesion: 0.13
Nodes (14): ALL_WORDS, check(), CORE_WORDS, CUSTOM_FILE, customWords, DATA_DIR, fs, loadCustomWords() (+6 more)

### Community 9 - "Bullying Names"
Cohesion: 0.22
Nodes (13): addName(), check(), DATA_DIR, ensureDir(), fs, getAll(), loadNames(), NAMES_FILE (+5 more)

### Community 10 - "Maintenance"
Cohesion: 0.27
Nodes (13): createTestKey(), crypto, db, deleteTestKey(), generateTestKey(), getMaintenanceData(), isBotTesting(), listTestKeys() (+5 more)

### Community 11 - "Notice System Frontend"
Cohesion: 0.32
Nodes (11): closeDetail(), fetchAnnouncement(), fetchCertInfo(), fetchNotices(), filterNotices(), loadAll(), mdToHtml(), onLoad() (+3 more)

### Community 12 - "Platform Features"
Cohesion: 0.24
Nodes (11): Admin Account Binding, Anti-Bullying Protection, Comment System, Like System, Wall SPA Content, Post Detail Page, Profile Editing System, Content Reporting Mechanism (+3 more)

### Community 13 - "Ecosystem & Mini-Program"
Cohesion: 0.29
Nodes (7): Notice Account Application System, WeChat Mini-Program Client, Campus Wall Ecosystem Entry Page, QR Code Login for Mini-Program (5min TTL), Discussion Topic System, Student Council Notice Publishing System, Voting System (Create/Vote/End)

### Community 14 - "Mini-Program Login"
Cohesion: 0.43
Nodes (4): handleScanResult(), pollStatus(), scanQrCode(), submitManualToken()

### Community 16 - "Vote System"
Cohesion: 0.47
Nodes (3): checkLogin(), onLoad(), onShow()

### Community 17 - "Post Management"
Cohesion: 0.33
Nodes (3): crypto, fs, path

### Community 19 - "Helper Functions"
Cohesion: 0.50
Nodes (3): draw_bell(), draw_user(), ImageDraw

## Knowledge Gaps
- **147 isolated node(s):** `fs`, `path`, `DATA_DIR`, `NAMES_FILE`, `pages/notice/notice` (+142 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `broadcastSSE()` connect `SSE Real-Time Notifications` to `Crypto Security`, `User Authentication & Login`, `Database & Hotness`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `Campus Wall 校园墙` connect `Anti-Bullying & User Agreement` to `Ecosystem & Mini-Program`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `verifySignedToken()` connect `Crypto Security` to `SSE Real-Time Notifications`, `User Authentication & Login`, `Database & Hotness`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Campus Wall 校园墙` (e.g. with `Agent Development Guide (Full Architecture)` and `User Knowledge Base (Dark Theme Documentation)`) actually correct?**
  _`Campus Wall 校园墙` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `DATA_DIR` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SSE Real-Time Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.052854122621564484 - nodes in this community are weakly interconnected._
- **Should `Crypto Security` be split into smaller, more focused modules?**
  _Cohesion score 0.07804878048780488 - nodes in this community are weakly interconnected._