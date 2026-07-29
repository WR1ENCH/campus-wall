# Repository Guidelines

## Project Overview

A middle school anonymous message board ("campus wall"). Backend is Node.js + Express + SQLite (better-sqlite3), frontend is a hash-free SPA with **no build step** — raw HTML/CSS/JS. Serves a WeChat Mini-Program companion from the same API.

Includes: posting/commenting/liking, discussion forum, QA bounty with voting, notices, lost-and-found auctions, bullying reports, admin panel, Zhixue (school) authentication, whisper (private messaging), credibility scoring, PLUS++ subscription system, SSE real-time push, safety center, penalty/appeal system, task center, and more.

**Key docs reference**: `docs_for_agent.md` (1556 lines) is the comprehensive project panorama. This file is the condensed startup reference.

---

## Quick Start

```bash
npm install             # install deps (better-sqlite3 needs build tools)
cp .env.example .env    # edit TOKEN_SECRET / CERT_ENC_SECRET / SENSITIVE_KEY
npm start               # node server.js (default port 3000)
```

- Frontend: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html` (first visit → create super admin)
- E2E tests: `node bot_test.js` (requires running server)

No build step. Edit HTML/CSS/JS directly, restart server.

---

## Architecture & Data Flow

```
Client (HTML/JS SPA) → Express server.js → routes/*.js → db.js (better-sqlite3) → data/campus.db
                                    ↕
                              lib/*.js (crypto, middleware, state, sse, etc.)
```

**Request lifecycle** (server.js, order-sensitive):
1. Load `.env` (manual parse, fills `process.env` only if unset)
2. Read git SHA → version string (`cachedGitSha`/`cachedCommitMsg`)
3. Crash protection (`uncaughtException` / `unhandledRejection`)
4. Try load `zhixue.js` (fail = warn only)
5. Middleware chain: `compression` → `cors` (wide open) → `cookieParser` → `express.json` (50MB) → `inputSanitize` → `createCheckMaintenance`
6. **Desktop→mobile iframe wrapper** — desktop UA + GET HTML + not `?mf=1` → return 768px-wide iframe shell. Mobile UA bypasses. Pages in `FRAME_PAGES`: `/`, `/index.html`, `/post.html`, `/user.html`, `/notice.html`, `/report.html`, `/bully.html`, `/knowledge.html`, `/ecosystem.html`, `/agreement.html`, `/apply-notice.html`, `/credit.html`, `/featured.html`, `/launch.html`, `/maintenance.html`, `/safety.html`, `/plus.html`. **Not iframed**: `admin.html`, `intro.html`.
7. SPA fragment middleware: `GET` + `X-SPA-Request: 1` → serve `pages/*.html` via `PAGE_MAP`
8. `express.static(__dirname)` — static files (including root full HTML pages)
9. Mount 20 route modules — **order is critical** (see Route Registration Order) + 4 sub-modules loaded by `task-center.js`

**Data flow**: all DB ops are **synchronous** (better-sqlite3 sync API). Two patterns:
- **Bulk**: `readPosts()` returns array → mutate → `writePosts()` (internally `DELETE FROM + INSERT INTO` via `dropAndInsert`)
- **Single-row**: `insertRow()`, `updateRow()`, `deleteRow()`
- SSE broadcasts (`broadcastSSE`) on writes for real-time updates

**Exception**: `zhixue.js` (external HTTP) and `bot_test.js` (Playwright) use `async`. All other server code is synchronous.

---

## Tech Stack

| Category | Tech | Notes |
|----------|------|-------|
| Runtime | Node.js ≥ 18 | modern syntax used |
| Backend | Express ^4.22 | all routes mounted directly on `app` (no express.Router) |
| Database | better-sqlite3 ^11 | synchronous, WAL mode, file `data/campus.db` |
| Captcha | slider-captcha ^1.0 | `slider-captcha/longbow.slidercaptcha.min.js` |
| Middleware | compression, cookie-parser, cors | standard |
| Frontend | Raw HTML/CSS/JS SPA | `spa.js` custom router, no build step |
| Encryption | Node built-in `crypto` | PBKDF2 password hashing, AES-256-CBC real-name encryption, HMAC-SHA256 token signing |
| Mini-prog | WeChat native | `campus-wall-miniprogram/` |

---

## Project Structure

```
campus-wall/
├── server.js                     # Entry: Express, middleware, SPA routing, mount all routes
├── db.js                         # Data layer: SQLite + auto-migrate + readXxx/writeXxx API
├── maintenance.js                # Maintenance mode module (test key create/verify)
├── zhixue.js                     # Optional Zhixue school auth (async, fail=warn)
├── sensitiveWords.js             # Sensitive word loading (+ decryption)
├── crypto_words.js / bullyingNames.js  # Encrypted word lists / bullying name list
├── nicknameChanges.js            # Nickname change tracking (monthly count, data/nickname_changes.json)
├── spa.js                        # Frontend SPA router (class SpaRouter)
├── *.html                        # Root-level full pages (also SPA fragments via pages/)
│   ├── index.html                # Main SPA shell (~360KB, all wall CSS+JS)
│   ├── admin.html                # Admin panel (standalone, NOT iframed)
│   ├── intro.html                # Campus wall intro/landing page (bypasses maintenance mode)
│   ├── post.html / user.html     # Full pages with standalone JS+CSS
│   ├── safety.html               # Safety center
│   ├── plus.html / credit.html   # Subscription/credit pages
│   ├── task-center.html          # Task center: checkin, daily tasks, lucky wheel, achievements
│   ├── qa.html / vote.html       # QA bounty detail / Voting page
│   ├── bully.html / report.html  # Bullying report / feedback
│   ├── agreement.html / apply-notice.html / featured.html / launch.html  # Static info pages
│   └── ...                       # knowledge.html, ecosystem.html, notice.html, etc.
├── pages/                        # SPA-only fragments (mirror root HTML body content)
│   ├── wall.html                 # Main wall fragment (PAGE_MAP['/'])
│   ├── admin.html / user.html / post.html / notice.html
│   ├── report.html / bully.html
│   ├── knowledge.html / ecosystem.html / safety.html
│   ├── qa.html / task-center.html / plus.html
│   └── ...                       # Not all pages have fragments: intro.html, credit.html, etc. are direct-browse only
├── mbti-questions.js             # 30 MBTI quiz questions (global var window.MBTI_QUESTIONS)
├── temp_user_js.js               # User profile / MBTI test frontend script (global functions)
├── assets/                       # Screenshots & static assets
├── css/
│   └── plus.css                  # PLUS++ gold frame/badge styles
├── lib/                          # Backend shared modules
│   ├── crypto.js                 # Password hash / token sign / AES real-name encrypt
│   ├── middleware.js             # requireAdmin/requireSuper/inputSanitize/checkMaintenance/rateLimit
│   ├── state.js                  # In-memory Maps (captcha, rate limits, online users, etc.)
│   ├── sse.js                    # SSE real-time push (broadcastSSE)
│   ├── cache.js                  # Simple in-memory cache (get/set)
│   ├── helpers.js                # getClientIP util
│   ├── uniqueId.js               # generateId(prefix)/generateUID/isValidIdFormat
│   ├── idMigration.js            # Startup old→prefixed ID format migration
│   ├── credibility.js            # Credibility score (thresholds, exchange rates)
│   ├── penalty.js                # T0/T1 punishment system, feature blocking, auto-expiry
│   ├── anti-abuse.js             # Task-center abuse prevention (daily claim / wheel spin limits via JSON file)
│   ├── hotness.js                # Post hotness/ranking algorithm
│   └── subscription.js           # PLUS++ subscription shared logic (Luhn, card gen, isUserPlus)
├── routes/                       # API modules (each exports function(app))
│   ├── penalty.js                # Punishment/appeal management API
│   ├── reports.js                # Unified reporting API
│   ├── admin.js                  # Admin panel (largest, 150+ symbols)
│   ├── auth.js                   # Admin init/login/password/list
│   ├── user.js                   # User register/login/profile/auth/credits/QR / MBTI
│   ├── posts.js                  # Posts/comments/likes/reports
│   ├── discussions.js            # Discussion forum
│   ├── qa.js                     # QA bounty Q&A
│   ├── votes.js                  # Voting
│   ├── notices.js                # Campus announcements + notices
│   ├── pickup.js                 # Lost & found / auction
│   ├── student-council.js        # Student council login
│   ├── whispers.js               # Private messaging
│   ├── wall-messages.js          # Profile wall / guestbook messages
│   ├── subscription.js           # PLUS++ purchase/renew/card redeem
│   ├── task-center.js            # Task center hub (orchestrates checkin/daily-tasks/lucky-wheel/achievements)
│   ├── checkin.js                # Daily checkin (calendar, streak, milestone rewards) — loaded by task-center.js
│   ├── daily-tasks.js            # Generated daily task pool & progress — loaded by task-center.js, posts.js, etc.
│   ├── lucky-wheel.js            # Lucky wheel spins & rewards — loaded by task-center.js
│   ├── achievements.js           # Achievement unlock system — loaded by task-center.js
│   ├── newbie-task.js            # Newbie tutorial tasks (grants trial SUBS)
│   ├── maintenance.js            # Maintenance mode public API
│   ├── visits.js                 # Profile visit records
│   └── system.js                 # Version/stats/heartbeat/SSE/bullying-report
```

---

## Route Registration Order (⚠️ CRITICAL — Editing This Breaks Things)

```javascript
// server.js — ACTUAL mount order (DO NOT REORDER without understanding conflicts)
require('./routes/penalty')(app);           // must be BEFORE admin
require('./routes/reports')(app);           // must be BEFORE admin
require('./routes/admin')(app);             // registers /api/admin/votes/:id etc.
require('./routes/auth')(app);              // registers /api/admin/:id (generic catch-all!)
require('./routes/user')(app);
require('./routes/posts')(app);
require('./routes/discussions')(app);
require('./routes/qa')(app);
require('./routes/votes')(app);
require('./routes/notices')(app);
require('./routes/pickup')(app);
require('./routes/student-council')(app);
require('./routes/whispers')(app);
require('./routes/wall-messages')(app);    // Profile wall messages
require('./routes/subscription')(app);
require('./routes/task-center')(app);       // Hub: checkin, daily-tasks, lucky-wheel, achievements
require('./routes/maintenance')(app);
require('./routes/visits')(app);
require('./routes/newbie-task')(app);       // Newbie tutorial tasks (trial SUBS)
require('./routes/system')(app, { sseClients, cachedGitSha, cachedCommitMsg });
```

**Why**: `admin.js` registers specialized routes like `/api/admin/votes/:id`. `auth.js` registers a generic `/api/admin/:id` catch-all. If auth comes first, the generic route swallows specialized ones — returning "管理员不存在" instead of the expected handler.

---

## Auth & Token System

**Custom token** (not JWT): `base64(JSON payload) + '.' + base64(HMAC-SHA256(payload, TOKEN_SECRET))`

**Three token types**:

| Identity | Header | Middleware | Expiry |
|----------|--------|-----------|--------|
| User | `x-user-token` | `verifyUserToken()` in route handlers | 7 days |
| Admin | `x-admin-token` | `requireAdmin` → sets `req.admin` | 24 hours |
| Student Council | `x-sc-token` | route-level inline check | — |

**Password hash**: PBKDF2-SHA512, 100,000 iterations, `salt:hash` format.

**Real-name encryption**: AES-256-CBC via `CERT_ENC_SECRET`. If unset, random key each restart → existing encrypted data becomes undecryptable (SECURITY warning on startup).

**Protected super admin**: account `wr1Ench` — deletion, demotion, and role-change are blocked in code.

---

## Code Conventions & Patterns

### Error Handling — Early Return

```javascript
app.post('/api/xxx', (req, res) => {
  if (!req.body.field) {
    return res.json({ ok: false, msg: '请输入字段', code: 'MISSING_FIELD' });
  }
  res.json({ ok: true, data: { ... } });
});
```

- All responses: `{ ok: boolean, msg?: string, code?: string, data?: any }`
- `msg` is Chinese user-facing text. `code` is machine-readable error (e.g. `MAINTENANCE`, `RATE_LIMIT`, `NOT_LOGIN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`).

### DB — Synchronous

```javascript
const posts = db.readPosts();
posts.push(newPost);
db.writePosts(posts);                   // dropAndInsert: DELETE FROM + INSERT INTO

const user = db.insertUser({ id, nickname });
db.updateUser(id, { nickname: 'new_name' });
db.deleteRow('users', id);
db.getPosts({ type: 'text', limit: 20 });
db.countRows('users', 'status = ?', ['active']);
```

`writeXxx` most = bulk read → mutate → `dropAndInsert` (DELETE + re-INSERT all rows). Acceptable at this data volume but **concurrent writes to the same table have race risk**.

### Module Export Patterns

```javascript
// Route files
module.exports = function(app) { ... };
module.exports = function(app, opts) { ... };    // system.js passes opts

// Utility libs
module.exports = { func1, func2, ... };
```

### Naming Conventions

| Context | Convention | Examples |
|---------|-----------|---------|
| Files/dirs | kebab-case | `routes/user.js`, `lib/crypto.js` |
| Variables/functions | camelCase | `readPosts`, `verifyPassword`, `requireAdmin` |
| DB tables | snake_case (plural) | `posts`, `users`, `admins`, `login_logs` |
| DB fields | camelCase (mixed) | `createdAt`, `loginAt`, `banUntil` |
### Unique ID Prefixes

| Prefix | Entity | Generator |
|--------|--------|-----------|
| `POST` | Post | `routes/posts.js` |
| `POCM` | Post comment | `routes/posts.js` |
| `DISC` | Discussion topic | `routes/discussions.js` |
| `DICM` | Discussion comment | `routes/discussions.js` |
| `QAQU` | QA question | `routes/qa.js` |
| `QAAN` | QA answer | `routes/qa.js` |
| `VOTE` | Vote | `routes/votes.js` |
| `AURQ` | Auction request | `routes/pickup.js` |
| `CRDL` | Credibility log | `lib/credibility.js` |
| `REPO` | Report | `routes/reports.js` |
| `PUNI` | Punishment | `routes/penalty.js` |
| `APP` | Appeal | `routes/penalty.js` |
| `BULL` | Bullying report | `routes/system.js` |
| `WHIS` | Whisper | `routes/whispers.js` |
| `PV` | Page visit | `routes/visits.js` / `db.js` |
| `WLMS` | Wall message | `routes/wall-messages.js` |
| `SUBS` | Subscription | `routes/subscription.js` |
| `PLCR` | Registered in `VALID_PREFIXES` but unused (no `generateId('PLCR')` calls in codebase) | — |
| (none) | User UID | 16-digit random numeric string |

### State Management (In-Memory, Lost on Restart)

**In `lib/state.js`**:
- `captchaStore` — slider captcha sessions (5min TTL)
- `captchaGrantLimit` — captcha token grant rate limit (15/min per IP)
- `postRateLimit` — 3 posts per 5min
- `qrCodeStore` — QR login sessions
- `loginFailures` — 10 fails per 15min per IP → 429
- `onlineUsers` — heartbeat timestamps
- `redeemRateLimit` / `cardCreateLimits` — credit/card rate limits
- `voteIpTimestamps` — vote IP anti-fraud (10min sliding window, /24 subnet limit)
- `voteFingerprints` — browser fingerprint anti-duplicate-vote
- `wallMessageRateLimit` — wall message send rate (60s per sender-receiver pair)
- `wallMessageDayPass` — daily visitor list pass per user

**In `routes/discussions.js`** (local to the module):
- `discussionCreateLimit` — 1min window, max 5 creates
- `commentDeleteLimit` — 1min window, max 30 deletes per IP


---

## Input Sanitization — ⚠️ CRITICAL WHEN ADDING FIELDS

`inputSanitize` (global middleware) strips `[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?]` from `req.body`.

**Whitelisted fields** that KEEP special characters: `avatar`, `manualImages`, `manualEmail`, `images`, `content`, `title`, `text`, `body`, `reason`, `answer`, `question`, `description`, `options`, `password`, `zhixuePassword`, `oldPwd`, `newPwd`, `adminPassword`, `newPassword`, `confirmPassword`, `oldPassword`, `plan`, `payment`, `cardCode`, `duration`.

→ If you add a new user-visible text field that needs special chars, add it to this whitelist.

## Common Pitfalls (Read Before Editing)

---

1. **SSE events**: server broadcasts `postUpdate`, `discussionUpdate`, `noticeUpdate`, `voteUpdate`, `pickupUpdate`, `qaUpdate`, `announcementUpdate`, `subscriptionUpdate`, `profileVisit`. `ping` is a server-side SSE heartbeat (`client.write` in `lib/sse.js` every 15s). **Frontend (`index.html`) only actively registers listeners for** `postUpdate` and `noticeUpdate` — receives `connected` (browser-native). Other events exist for downstream consumers.
2. **Sensitive word lib**: `sensitiveWords.js` loads encrypted tencent list + custom JSON. Change via admin API, not hard-coded.
3. **Slider captcha flow**: `POST /api/slider-captcha/grant` → captchaId (5min TTL). captchaId+text submitted with business request. Token only consumed on **successful** business operation — failed login doesn't invalidate captcha, user retries without re-sliding.
4. **Desktop iframe**: Adding a new frontend page that needs mobile layout? Register it in `FRAME_PAGES` in server.js, or desktop browsers will show desktop layout.
5. **Banner z-index**: `.page-banner` at z-index below fixed topbar (z-index:200). Needs `margin-top: 56px` to avoid occlusion.
6. **intro.html maintenance bypass**: `intro.html` is whitelisted in `createCheckMaintenance` — it's always accessible even during maintenance mode.
7. **Wall message credibility**: `wall_message` credibility threshold is 70 (below 70 = blocked from sending profile wall messages).
---

## Data Model (Key Tables)

All auto-created in `db.js migrate()` via `CREATE TABLE IF NOT EXISTS`. 4 tables (`checkin_calendar`, `daily_tasks`, `lucky_wheel_spins`, `user_achievements`) are created in their respective route files instead. See `docs_for_agent.md §4` for full schema.

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `users` | id, username, password, nickname, avatar, uid, credit, credibility_score(DEF 90), zhixueStatus, certRealName(encrypted), bullyingProtection, mbti, pinCount, pinMonth, checkinStreak, birthday, credibility_exchanged_total, createdAt, checkedInDate | Users + auth + credit + credibility + MBTI + bullying protection |
| `posts` | id(POST-), content, author, avatar, userId, type, time, visibility('public'/'self_only'/'whitelist'/'blacklist'), visibleTo, invisibleTo, allowComments(BOOL), pinned, pinnedAt, images, isAnonymous, likes, likedBy, liked, comments, commentsCount, discussionId, rotate, zIndex, deleted, deletedAt, deletedBy | Posts with visibility controls |
| `reports` | id(REPO-), type, postId, targetId, reason, reportedBy, reporterName, createdAt, status, handledBy, handledAt, action, handledResult, punishmentId, evidenceContent(JSON), reportedUserId | Unified reporting (see below) |
| `punishments` | punishmentId(PK), userId, level('T0'/'T1'), reason, measures(JSON), durationDays, status('active'/'expired'/'revoked'/'queued'), sourceReportId, appealUsed, appealStatus('none'/'pending'/'approved'/'rejected'), credibilityDeducted, createdAt, expiresAt, revokedAt, revokedBy | T0/T1 penalty records |
| `appeals` | id(APP-), punishmentId, userId, content, status('pending'/'approved'/'rejected'), createdAt, handledAt, handledBy, resultNote | Appeal records (one per punishment) |
| `discussions` | id(DISC-), title, expiresAt, createdAt, deleted, commentCount, createdBy, official | Discussion topics (max 3 active) |
| `discussion_comments` | id(DICM-), discussionId, parentId, content, author, avatar, userId, createdAt, deleted, syncPostId, likes, likedBy, hidden | Discussion comment replies |
| `whispers` | id(WHIS-), senderId, senderName, receiverId, receiverName, content, notifLevel('T1'/'T2'), createdAt, deleted, signed, signTime | Private messaging |
| `notices` | id, title, content, author, auto(BOOL), level, createdAt, deleted, pinned, synced, images, deletedAt, syncedAt, updatedAt, targetUserId | Notifications (auto + manual) |
| `user_notifications` | userId, notificationId(FK), read, readAt | Read-status bridge for notifications |
| `subscriptions` | id(SUBS-), userId, plan('weekly'/'monthly'/'trial'), startTime, endTime, price, paymentMethod, cardCode, status, renewedFrom, createdAt | PLUS++ subscriptions |
| `bullying` | id(BULL-), reporterRole('self'/'witness'), victimName, involvedUsers(JSON), contentIds(JSON), status, handledResult | Bullying reports |
| `login_logs` | id, type, account, success, ip, ua, time | Login log (max 500 rows) |
| `deleted_items` | id, type, content, author, userId, deletedAt, deletedBy, extra | Soft-delete content archive |
| `votes` | id(VOTE-), userId, author, avatar, title, options(JSON), multiple(INT), endTime, createdAt, deleted, allowCustom | Polls/voting |
| `vote_records` | id, voteId, optionId, userId, createdAt | Who voted on which option |
| `vote_ip_records` | id, voteId, ip, userId, createdAt | IP-based vote dedup |
| `qa_questions` | id(QAQU-), userId, author, title, content, bounty, deadline, status, acceptedAnswerId, images, deleted, pinned | QA bounty questions |
| `qa_answers` | id(QAAN-), questionId, userId, author, content, likes, accepted, reward, images, deleted | QA bounty answers |
| `pickup_auctions` | id(AURQ-), slot, date, userId, content, anonymous, amount, reviewStatus, isHighest, approvalStatus, bids(JSON), status, createdAt | Lost & found / auction |
| `pickup_reports` | id, bidId, slot, content, reason, reporterId, status | Auction bid reports |
| `wall_messages` | id(WLMS-), targetUserId, senderId, senderName, content, createdAt, read | Profile wall guestbook messages |
| `checkin_calendar` | id(AUTO), userId, date, streak, reward, isPlus, createdAt | Daily checkin records |
| `daily_tasks` | id(DT-), userId, date, taskType, taskTitle, taskDescription, taskIcon, targetCount, currentCount, reward, completed, claimed, createdAt | Generated daily task instances |
| `lucky_wheel_spins` | id(AUTO), userId, date, reward, rewardType, createdAt | Lucky wheel spin history |
| `user_achievements` | id(AUTO), userId, achievementId, progress, target, unlockedAt | Unlocked achievement records |
| `newbie_task_progress` | userId(PK), tasks(JSON), stageRewardsClaimed(JSON), completedAt, createdAt | Newbie tutorial task progress |
| `profile_visits` | id(PV-), visitedUserId, visitorUserId, createdAt, read | Profile page visit records |
| `credit_logs` | id, userId, amount, reason, createdAt | Credit transaction log |
| `credit_cards` | id, code(UNIQUE), value, status, createdBy, createdAt, usedBy, usedAt | Credit card redemption |
| `plus_cards` | code(PK), plan, duration, durationUnit, status, createdBy, createdAt, usedBy, usedAt | PLUS subscription cards |
| `announcement` | _id(PK), title, content, createdAt, updatedAt, publishedAt, publishedBy | Single-row campus announcement |
| `feedbacks` | id, type, description, contact, images, time, status, handledBy, handleNote | User feedback |
| `notice_applications` | id, name, department, contact, reason, userId, status, createdAt | Student council notice applications |
| `student_council` | _key(PK), _value | Student council KV store |
| `notice_passkey` | _key(PK), _value | Notice management passkey KV |
| `trust_tokens` | _key, userId, userAgent, createdAt, expiresAt | Trusted device tokens |
| `credibility_logs` | id(CRDL-), userId, amount, score, reason, type('deduct'/'restore'/'exchange'), createdAt | Credibility score change log |
| `trust_score_logs` | id, userId, amount, score, reason, createdAt | Trust score change log |
| `maintenance` | _key(PK), _value | Maintenance mode KV store |
| `ID_input` | _id(PK), entityType, entityId, content, assignedAt | ID migration audit log |
---

## Key Systems Overview

### T0/T1 Penalty & Unified Reporting System

**Unified report entry** (`POST /api/reports` → generates `REPO-` ID):
- Single entry point for all content types: `post`, `comment`, `discussion`, `discussion_comment`, `qa_question`, `qa_answer`, `whisper`, `featured`, `auction`
- Takes **evidence snapshot** (`getReportedContent()`) at creation time — future processing independent of original content edits
- **Auto-merge**: same content with existing `pending` report → appends reporter to `reporters` array, merges reasons
- Sensitive word auto-reports → `type: sensitive_post/sensitive_comment` with sanitized reason

**Penalty tiers** (`lib/penalty.js`):
- `T0` (full block): `isFeatureBlocked()` returns true for everything
- `T1` (partial block): only blocked from specific `measures` in `FEATURES = ['whisper', 'anonymous_post', 'qa', 'post', 'vote', 'wall_message']`

**Auto-stacking rules**:
- T0 + existing T0 → merge, longest duration
- T0 + existing T1 → T0 wins, existing T1 `queued` (auto-activated when T0 expires)
- T1 + existing T0 → new T1 `queued`, activates after T0 expiry
- T1 + existing T1 → merge measures (union), longest duration

**Appeals**: one per punishment. Admin `approve` → revoke punishment + restore credibility.

**Content auto-delete** on violation: `deleteReportedContent()` deletes the reported content and writes to `deleted_items`.

### Credibility Score System

- Initial: 90 (student verification +10)
- **Thresholds**: <90 no whisper, <85 no anonymous post, <80 no QA, <70 no wall_message, <60 no post, <50 no vote
- **Penalty integration**: admin can deduct credibility when creating punishment; revocation restores it
- **Credit → Credibility exchange**: tiered rates (300 credits per point for first 5 points, 700 for next 5, 1000 for last 5), max 15 points per quarter
- **Quarterly refresh**: Jan 1, Mar 1, Jun 1, Sep 1

### Post Visibility

- `visibility`: `public` (default) / `self_only` / `whitelist` / `blacklist`
- `visibleTo` / `invisibleTo`: JSON arrays of user IDs
- Non-public options mutually exclusive. Author always visible.
- `allowComments`: per-post toggle (default true)
- `sensitiveForce`: if true + sensitive word hit → force `self_only` pending review
- **Visibility immutable after creation** (exception: `no_violation` processing can restore `self_only`→`public`)

### Whisper (Private Messaging)

- Sender feature-blocked if credibility < 90
- Content checked against sensitive words + bullying names
- Weekly quota: 2 free (20 free for PLUS), then 200 credits each
- Recipient signs to acknowledge → sender notified
- Reportable via unified system

### Wall Messages (Profile Guestbook)

- Sender credibility >= 70 required
- Content max 100 chars (200 for PLUS++ users), checked against sensitive words
- Per-user rate limit: 60s cooldown per sender-receiver pair (in-memory state)
- Reportable via unified system
- T1-blockable: `wall_message` is in the T1 FEATURES list, so it can be blocked by T1 penalties

### Quota Systems

| Feature | Free Tier | Pay Tier | Reset |
|---------|-----------|----------|-------|
| Daily posts | 5/day | 39 credits per extra | Daily at 0:00 |
| Anonymous posts | 2/day | 50 credits per extra | Daily at 0:00 |
| Whispers | 2/week (20/week for PLUS) | 200 credits per extra | Weekly Mon 0:00 |
| QA questions | 3/week | 100 credits per extra | Weekly |
| Post pinning | 0 (non-PLUS) | 100 credits | n/a |
| Post pinning (PLUS) | 40/month free | 100 credits after | Monthly |
| Wall messages | 2/day | 59 credits per extra | Daily at 0:00 |

### PLUS++ Subscription

- Plans: weekly (399 credits) / monthly (699 credits)
- Check by `isUserPlus(userId)` in `lib/subscription.js`
- **Benefits**: gold frame on posts, rotating gold avatar border, unlimited daily posts, 40 free pins/month, 1 free nickname change/month, nickname change discount (99 vs 199 credits), 20 free whispers/week, wall message max length 200 chars (vs 100)
- Renewal: 48h discount window (15% off), auto-expiry check

### Task Center

Orchestrated by `routes/task-center.js` (hub), which loads sub-modules:
- **`checkin.js`** — Daily checkin: `checkin_calendar` table, streak tracking, daily rewards based on streak (10–500 credits, doubled for PLUS); no milestone achievements
- **`daily-tasks.js`** — Generated daily task pool: 3-4 random tasks/day (non-PLUS) or 5 tasks/day (PLUS), progress tracking, reward claiming. Also used by `posts.js`, `qa.js`, `visits.js`, `whispers.js`, `wall-messages.js` to call `updateTaskProgress()`.
- **`newbie-task.js`** — Newbie tutorial tasks: 13 tasks (post, like, comment, whisper, vote, discussion, search, mbti, profile visits, notifications, qa, auction, self-profile visit). 4 stages (3/7/10/13 tasks). Stage 4 grants a 3-day trial PLUS++ subscription. Progress is lazily initialized on first GET request.

**Task Center Quota**:
| Feature | Free Tier | Pay Tier | Reset |
|---------|-----------|----------|-------|
| Daily checkin | 1/day (10-500 credits, doubled for PLUS) | Same | Daily |
| Daily tasks | 3-4 random tasks/day (non-PLUS), 5 tasks/day (PLUS) | Same | Daily |
| Lucky wheel | 5 spins/day, requires ≥3 daily tasks completed | Same | Daily |
| Newbie trial | One-time SUBS grant | After trial ends | Never |

### MBTI Personality Test

- 30-question quiz in `mbti-questions.js` (global `window.MBTI_QUESTIONS`)
- Result stored as `mbti` column on `users` table (4-letter code like `INTJ`)
- **Privacy**: only the first letter (I/E) is exposed on posts via `authorMbti` field; full type visible only on own profile
- One-time test per user (no retake)
- Task center integration: `mbti_test` newbie task (30 credits reward)
- Frontend: `user.html` has test modal with progress bar, dimension scores, 16-personality Chinese names; also accessible from `index.html` profile panel
---

## Notification System (Dual-Table Model)

**Key insight**: two tables, separate concerns.

| Table | Role |
|-------|------|
| `notices` | Notification body: `targetUserId` (blank = public), `auto: true` marks auto-triggered |
| `user_notifications` | Read-status bridge: `(userId, notificationId, read)` |

**Read paths**:
- `GET /api/user/notices`: notices WHERE `!targetUserId OR targetUserId=me` — **no read filtering**
- `GET /api/user/notifications`: notices WHERE `targetUserId=me` — **no read filtering**
- `GET /api/user/notifications/unread-count`: counts `user_notifications` WHERE `read=0`
- `POST /api/user/notifications/mark-read`: only touches `user_notifications.read`

**Critical design property**: marking read only affects badge count, NOT whether the notice appears in lists. Marked-read notices remain visible.

**Auto-trigger bug risk**: automatic notification requires **dual write** (insert into `notices` + `addUserNotification`). Missing one = broken badge count or missing content. See `docs_for_agent.md §14` for all 12+ trigger points.

---

## Frontend Architecture (SPA)

### Page Model

- `index.html` is the **SPA shell** (~360KB): all wall CSS+JS in one file. Contains `<div id="main-content">` for page fragments.
- Root `*.html` files are **standalone full pages** (directly browsable).
- `pages/*.html` are **body-only fragments** for SPA injection. Only difference: no `<html>/<head>/<script>` wrappers.
- Navigation: `<a data-spa href="/post.html">` → `spa.js` intercepts → fetch with `X-SPA-Request: 1` → server serves `pages/post.html` → inject into `#main-content` + transition animation.

### SPA Router (`spa.js`)

- `class SpaRouter`: intercepts click (data-spa), popstate, mouseover (prefetch), scroll
- Cache: 60s TTL on fetched fragments
- Transitions: `.page-exit` / `.page-enter` + `spa-transitions.css`
- Instance: `new SpaRouter({ container: '#main-content' })`

### Frontend Patterns

- All API calls: native `fetch('/api/*')`
- User token in localStorage as `campus_user_token`. Header: `x-user-token`
- Admin token: `x-admin-token`. SC token: `x-sc-token`
- `showToast()` for user feedback. `currentUser` global from localStorage.
- Markdown via CDN `marked.min.js`. Content escaped against XSS (inputSanitize + client-side).
- Inline SVG icons (stroke-based, no emoji, no icon fonts except Google Fonts).
- CSS: inline `<style>` per page. Shared stylesheets: `css/plus.css`, `css/task-center.css`, `spa-transitions.css`.
- JS: `spa.js` (router) + `js/task-center.js` (task center frontend logic). All other pages have inline `<script>`.
- Mobile-first: iframe wrapper for desktop (see lifecycle step 6). Admin.html is desktop-native.

### Adding a New Frontend Page

1. Create `xxx.html` (full standalone page, see existing for reference).
2. Create `pages/xxx.html` (body-only fragment).
3. Add to `PAGE_MAP` in server.js: `'/xxx.html': 'pages/xxx.html'`.
4. If it needs the desktop iframe wrapper, add to `FRAME_PAGES` in server.js.
5. Link with `<a data-spa href="/xxx.html">`.

---

## Environment Configuration

Copy `.env.example` → `.env` (gitignored):

| Variable | Required | Notes |
|----------|----------|-------|
| `TOKEN_SECRET` | Recommended | HMAC key for token signing. Random on each restart = all tokens invalidated. |
| `CERT_ENC_SECRET` | Strongly | AES-256 key (64 hex chars) for real-name encryption. Random on restart = encrypted data undecryptable. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SENSITIVE_KEY` | With tencent word list | 32-byte hex key to decrypt `tencent_sensitive_words.enc` |
| `PORT` | No | Default 3000 |

---

## Deployment

```bash
npm install -g pm2
pm2 start server.js --name campus-wall
pm2 logs campus-wall
```

**Backup**: `data/campus.db` (+ `-wal`/`-shm`) = all data. `data/` is gitignored.

---

## Testing

- **E2E**: `node bot_test.js` (Playwright, ~526 lines). Creates test users via API, runs browser interactions. Needs running server.
- **Format**: `PASS('1.1', 'desc')` / `FAIL('1.1', 'reason')` / `SKIP()` helpers. Results collected, printed at end.
- **No unit tests**: No Jest/Mocha.
- **CI/CD**: GitHub Actions — CodeQL on push/PR to master + weekly; Issue summarizer.

---

## CodeGraph & Graphify Usage

This project has **CodeGraph** indexing (`.codegraph/` directory). Before editing:
1. Use `codegraph explore "<question>"` or the MCP `codegraph_explore` tool to understand the relevant code — returns verbatim source + call paths in one call.
2. Don't grep/read first when codegraph can answer.

This project also has **graphify** knowledge graph at `graphify-out/`:
- `graphify-out/graph.html` — interactive browser view
- `graphify-out/graph.json` — raw NetworkX format
- `graphify-out/GRAPH_REPORT.md` — audit report with hub nodes, unexpected connections
- Update: `graphify . --update` (incremental), `graphify .` (full rebuild)
- **Command**: `graphify query "<question>"` to query the knowledge graph

See `docs_for_agent.md §16` for graph details.

---

## How to Add a New Backend Feature

1. **Table** (if persisting): add `CREATE TABLE IF NOT EXISTS` + `readXxx()`/`writeXxx()` in `db.js migrate()`.
2. **Route file** `routes/xxx.js`: `module.exports = function(app) { app.get('/api/xxx', ...) }`.
3. **Mount** in `server.js` at the correct position (consider route order constraints).
4. **Auth**: inline `verifyUserToken()` for user routes; `requireAdmin` (optionally `requireSuper`) for admin.
5. **Post-write SSE**: call `broadcastSSE('xxxUpdate', {...})` for real-time updates.
6. **Response format**: `{ ok: true, data }` / `{ ok: false, msg, code }`.
7. **Frontend**: call with `fetch('/api/xxx', { headers: { 'x-user-token': token } })`. Add fragment to `pages/` if needed.
8. **Whitelist** new body fields in `inputSanitize` if they need special characters.

---

## Key Module Dependencies

```
server.js
├─ lib/crypto.js          (passwords/tokens/encryption) ← middleware, routes, maintenance
├─ lib/middleware.js      (auth/filter/rate-limit/maintenance) ← server.js, routes
├─ lib/state.js           (in-memory Maps, vote anti-fraud, wall message rate limits) ← middleware, routes
├─ lib/sse.js             (real-time push) ← routes
├─ lib/anti-abuse.js      (task-center abuse prevention via JSON file) ← daily-tasks, lucky-wheel
├─ db.js                  (SQLite access) ← nearly all routes
├─ maintenance.js         (maintenance state/test keys) ← server.js, routes, middleware
└─ routes/*.js            (business logic) ← mounted by server.js
```

**High-frequency change points**:
- Login/password → `lib/crypto.js` + `routes/auth.js` + `routes/user.js`
- Permissions/filtering/rate limits → `lib/middleware.js`
- Data schema → `db.js` (migrate + API)
- Real-time push → `lib/sse.js` + route's write wrapper
- Task center / checkin / daily tasks / achievements → `routes/task-center.js`, `routes/checkin.js`, `routes/daily-tasks.js`, `routes/achievements.js`, `routes/lucky-wheel.js`, `lib/anti-abuse.js`
- MBTI → `routes/user.js` (PATCH/GET mbti), `mbti-questions.js`, `user.html`, `index.html`, `post.html`
- Wall messages → `routes/wall-messages.js`, `lib/state.js` (rate limits)
- Frontend interaction → corresponding `*.html` + `pages/*.html` + `spa.js`
- Admin panel → `admin.html`
---

## One-Sentence Memory
> Node+Express+SQLite native frontend campus wall. **All routes on `app`** (no express.Router). **`admin.js` before `auth.js`**. **Body special chars globally filtered but whitelist fields exempt**. **Three token headers: `x-user-token`/`x-admin-token`/`x-sc-token`**. **Data via `db.js` read/write, mostly full-table rewrite (`dropAndInsert`)**. **In-memory Maps lost on restart**. **Real-time via SSE `broadcastSSE`**. **20 mounted routes + 4 sub-modules (checkin/daily-tasks/lucky-wheel/achievements) loaded by task-center.js**. Use codegraph explore before editing.
