# Repository Guidelines

## Project Overview

A middle school anonymous message board ("campus wall"). Backend is Node.js + Express + SQLite (better-sqlite3), frontend is a hash-free SPA with **no build step** — raw HTML/CSS/JS. Includes: posting/commenting/liking, discussion forum, QA bounty, voting, notices, lost-and-found auctions, bullying reports, admin panel, Zhixue (school) authentication, credibility/credit systems, SSE real-time push, and a WeChat Mini-Program companion.

---

## Architecture & Data Flow

```
Client (HTML/JS SPA) → Express server.js → routes/*.js → db.js (better-sqlite3) → data/campus.db
                                    ↕
                              lib/*.js (crypto, middleware, state, sse, etc.)
```

**Request lifecycle** (server.js, order-sensitive):
1. Load `.env` (manual parse, fills `process.env` only if unset)
2. Read git SHA → version string
3. Crash protection (`uncaughtException` / `unhandledRejection`)
4. Middleware: `compression` → `cors` (wide open) → `cookieParser` → `express.json` (50MB) → `inputSanitize` → `createCheckMaintenance`
5. Desktop→mobile iframe wrapper (768px wide for desktop UA, bypass with `?mf=1`)
6. SPA fragment middleware (`X-SPA-Request: 1` → serves `pages/*.html`)
7. `express.static(__dirname)`
8. Mount 16 route modules (order matters — see Routes section)
9. `app.listen(PORT)`

**Data flow**: all DB ops are **synchronous** (better-sqlite3 sync API). Two patterns:
- **Bulk**: `readPosts()` returns array → mutate → `writePosts()` (internally `DELETE FROM + INSERT INTO`)
- **Single-row**: `insertRow()`, `updateRow()`, `deleteRow()`
- SSE broadcasts (`broadcastSSE`) on writes for real-time updates.

---

## Key Directories

| Path | Purpose |
|------|---------|
| `server.js` | Express entry point, middleware, route mounting |
| `db.js` | SQLite connection, migrations, all `readXxx/writeXxx` data access |
| `routes/` | 16 API route modules (one per domain) |
| `lib/` | 12 utility modules (crypto, middleware, state, sse, cache, etc.) |
| `pages/` | 11 SPA body-only fragments (mirror root HTML pages) |
| `*.html` | Standalone pages (also serve as SPA fragments) |
| `css/` | Shared CSS (`plus.css` for PLUS++ styling) |
| `data/` | Runtime data (gitignored): `campus.db`, logs |
| `campus-wall-miniprogram/` | WeChat Mini-Program companion |
| `scripts/` | One-off migration scripts |
| `slider-captcha/` | Vendor slider captcha lib |

---

## Development Commands

```bash
npm install             # install deps (better-sqlite3 needs build tools)
npm start               # node server.js (default port 3000)
node bot_test.js        # Playwright E2E tests (requires running server)
node scripts/backfill-notice-author.js   # one-time data migration
```

- **No build step**. No webpack, no bundler. Edit HTML/JS/CSS directly.
- **Runtime**: Node.js ≥ 18 (no `engines` lock but modern syntax used).
- **Port**: `PORT` env var, default 3000.

---

## Code Conventions & Common Patterns

### Route Module Export

```javascript
// routes/auth.js — all routes follow this pattern
module.exports = function(app, opts) {
  app.get('/api/admin/check-init', (req, res) => {
    // ...
  });
  app.post('/api/admin/login', (req, res) => {
    // ...
  });
};
```

Mounted in server.js as `require('./routes/auth')(app)`.

### Route Registration Order (Critical)

```javascript
// server.js — DO NOT REORDER without understanding the conflict
require('./routes/penalty')(app);       // must be before admin
require('./routes/reports')(app);       // must be before admin
require('./routes/admin')(app);         // has /api/admin/votes/:id etc.
require('./routes/auth')(app);          // has /api/admin/:id (generic catch-all)
require('./routes/user')(app);
require('./routes/posts')(app);
require('./routes/discussions')(app);
require('./routes/qa')(app);
require('./routes/votes')(app);
require('./routes/notices')(app);
require('./routes/pickup')(app);
require('./routes/student-council')(app);
require('./routes/whispers')(app);
require('./routes/subscription')(app);
require('./routes/maintenance')(app);
require('./routes/visits')(app);
require('./routes/system')(app, { sseClients, cachedGitSha, cachedCommitMsg });
```

**Why**: `admin.js` registers specialized routes like `/api/admin/votes/:id`; `auth.js` registers a generic `/api/admin/:id` catch-all. If auth comes first, the generic route swallows the specialized ones.

### Error Handling — Early Return

```javascript
app.post('/api/xxx', (req, res) => {
  if (!req.body.field) {
    return res.json({ ok: false, msg: '请输入字段', code: 'MISSING_FIELD' });
  }
  // success path
  res.json({ ok: true, data: { ... } });
});
```

- All responses: `{ ok: boolean, msg?: string, code?: string, data?: any }`
- `msg` is Chinese user-facing text.
- `code` is an optional machine-readable error code (e.g. `'MAINTENANCE'`, `'RATE_LIMIT'`).
- All validation errors are early-return with `return res.json(...)` — no deep nesting.

### DB Synchronous Pattern

```javascript
// better-sqlite3 is synchronous — NO async/await in server code
const posts = db.readPosts();           // returns array
const newPost = { id: generateId('POST'), content: '...' };
posts.push(newPost);
db.writePosts(posts);                   // DELETE FROM + INSERT INTO (dropAndInsert)

// Single-row operations
const user = db.insertUser({ id, nickname });
db.updateUser(id, { nickname: 'new_name' });
db.deleteRow('users', id);
db.getPosts({ type: 'text', limit: 20 });
db.countRows('users', 'status = ?', ['active']);
```

**Exception**: `zhixue.js` (external HTTP requests) uses `async`. `bot_test.js` (Playwright) uses `async`. All other server code is synchronous.

### Token & Auth

- **Custom token** (not JWT): `base64(JSON payload) + '.' + base64(HMAC-SHA256(payload, secret))`
- **Auth headers**: `x-user-token` (user, 7d), `x-admin-token` (admin, 24h), `x-sc-token` (student council)
- **Middleware**: `requireAdmin(req, res, next)` validates `x-admin-token`, sets `req.admin`. `requireSuper` checks `req.admin.role === 'super'`.
- **Password hash**: PBKDF2-SHA512, 100000 iterations, salt:hash format.
- **Real-name encryption**: AES-256-CBC via `CERT_ENC_SECRET` — if unset, random key each restart (existing data becomes undecryptable).

### Middleware Composition

```javascript
app.use(inputSanitize);                  // global: strips special chars from body
app.use(createCheckMaintenance(read, write, verify));  // global: maintenance gate

app.post('/api/admin/login', rateLimitLogin('id'), handler);  // per-route
app.get('/api/admin/xxx', requireAdmin, requireSuper, handler);
```

`inputSanitize` has a **whitelist** of fields that keep special characters: `avatar, manualImages, manualEmail, images, content, title, text, body, reason, answer, question, description, options`. If you add a new user-visible text field, add it to this whitelist.

### State Management

All in-memory (process-level Maps, lost on restart):
```javascript
// lib/state.js
const captchaStore = new Map();       // 5min TTL
const postRateLimit = new Map();      // 3 posts per 5min
const qrCodeStore = new Map();        // QR login sessions
const onlineUsers = new Map();        // heartbeat timestamps
const loginFailures = new Map();      // 10 fails per 15min per IP
// Cleanup: setInterval every 60s
```

### Naming Conventions

| Context | Convention | Examples |
|---------|-----------|---------|
| Files/dirs | kebab-case | `routes/user.js`, `lib/crypto.js` |
| Variables/functions | camelCase | `readPosts`, `verifyPassword`, `requireAdmin` |
| DB tables | snake_case (plural) | `posts`, `users`, `admins`, `login_logs` |
| DB fields | camelCase (mixed) | `createdAt`, `loginAt`, `banUntil` |
| Constants | UPPER_SNAKE_CASE | `TOKEN_SECRET`, `LOGIN_WINDOW_MS`, `SALT_LEN` |
| HTTP headers | kebab-case | `x-admin-token`, `x-user-token` |
| API paths | kebab-case | `/api/admin/check-init`, `/api/user/forgot-password` |
| IDs | `PREFIX-[A-Z0-9]{16}` | `POST-ABC123...`, `DISC-DEF456...`, `VOTE-GHI789...` |

### Module Export Patterns

```javascript
// Route files
module.exports = function(app) { ... };
module.exports = function(app, opts) { ... };

// Utility libraries
module.exports = { func1, func2, ... };

// db.js — large mixed export (read/write functions + query helpers)
```

### Unique ID Prefixes

| Prefix | Entity | Generated in |
|--------|--------|-------------|
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
| `PV` | Page visit | `routes/visits.js` / `db.js` |
| (none) | User UID | 16-digit numeric string |

### Frontend SPA Pattern

- **Router**: `spa.js` (SpaRouter class) — intercepts `a[data-spa]` clicks, `history.pushState`, fetches URL with `X-SPA-Request: 1` header, swaps `<body>` into `#main-content`.
- **Dual-purpose pages**: e.g. `post.html` is a standalone full page AND its `<body>` content is served as `pages/post.html` for SPA fetch.
- **CSS**: inline `<style>` in each HTML page (no external CSS framework). `css/plus.css` is the only shared stylesheet. `spa-transitions.css` for page transitions.
- **JS**: direct DOM manipulation (`document.createElement`, `innerHTML`). `fetch()` with `async/await`. `showToast()` for user feedback. `currentUser` global from localStorage.
- **Desktop**: iframe wrapper at 768px width to force mobile layout (desktop browsers ignore viewport meta).

---

## Important Files

| File | Role |
|------|------|
| `server.js` | Entry point, middleware chain, route mounting, SPA/iframe logic |
| `db.js` | SQLite connection, auto-migration, all data access methods |
| `lib/crypto.js` | Password hashing, token signing, real-name encryption |
| `lib/middleware.js` | `requireAdmin`, `requireSuper`, `inputSanitize`, `createCheckMaintenance`, `rateLimitLogin` |
| `lib/state.js` | In-memory Maps for captcha, rate limits, online users, login failures |
| `lib/sse.js` | SSE real-time push (`broadcastSSE`) |
| `lib/uniqueId.js` | `generateId(prefix)`, `generateUID()`, `isValidIdFormat()` |
| `lib/credibility.js` | Credibility score system (thresholds, exchange rates) |
| `lib/penalty.js` | T0/T1 punishment system, feature blocking, auto-expiry |
| `lib/hotness.js` | Post hotness/ranking algorithm |
| `lib/subscription.js` | PLUS++ subscription shared logic |
| `lib/cache.js` | Simple in-memory cache (get/set) |
| `lib/helpers.js` | `getClientIP` utility |
| `lib/idMigration.js` | Startup ID format migration (old → prefixed) |
| `maintenance.js` | Maintenance mode read/write, test key creation/verification |
| `sensitiveWords.js` | Sensitive word loading + decryption |
| `zhixue.js` | Optional Zhixue school authentication (async) |
| `spa.js` | Frontend SPA router |
| `index.html` | Main SPA shell (9512 lines, all wall CSS+JS) |
| `admin.html` | Admin panel (standalone, not iframe-wrapped) |
| `.env` | Runtime config (PORT, TOKEN_SECRET, CERT_ENC_SECRET, SENSITIVE_KEY) |
| `package.json` | Dependencies (6 prod, 2 dev), `npm start` script |

---

## Runtime & Tooling Preferences

- **Runtime**: Node.js (any modern version). No Bun, no Deno.
- **Package manager**: npm. `package-lock.json` is committed.
- **No build step**: edit HTML/CSS/JS directly, restart server.
- **Database**: SQLite via better-sqlite3. File at `data/campus.db` (WAL mode). Gitignored.
- **Environment**: `.env` file (gitignored). Copy from `.env.example`.
- **Local dev**: `npm install && npm start`, then open `http://localhost:3000`.
- **ESLint/Prettier**: None. Follow existing conventions manually.

---

## Testing & QA

- **E2E tests**: `bot_test.js` (Playwright, 526 lines). Creates test users via API, runs browser interactions. Run with `node bot_test.js` while server is running.
- **Test format**: `PASS('1.1', 'description')` / `FAIL('1.1', 'reason')` / `SKIP()` helpers. Results collected in array, printed at end.
- **No unit tests**: No Jest, Mocha, or other framework.
- **No test runner**: Tests are plain Node scripts.
- **CI/CD**: GitHub Actions — CodeQL security scan (on push/PR to master + weekly), Issue summarizer on new issues.
- **No deployment pipeline**: Manual `npm start` on server.