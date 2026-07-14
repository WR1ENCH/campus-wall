# 悄悄话功能 实现计划

**Goal:** 在校园墙系统新增用户间悄悄话功能，含搜索用户、敏感词检测、处罚限制、T1通知、签收确认和举报处理。

**架构:** 新建 `routes/whispers.js` 后端路由 + `lib/uniqueId.js` 加前缀 + `lib/penalty.js` 加举报证据快照 + `index.html` 新增弹窗UI。

**Tech Stack:** Node.js/Express, SQLite (better-sqlite3), 原生 HTML/CSS/JS SPA

---

### Task 1: 后端基础 — uniqueId + db + penalty 扩展

**Files:**
- Modify: `lib/uniqueId.js`
- Modify: `db.js` (whispers 表加列迁移)
- Modify: `lib/penalty.js` (getReportedContent 加 whisper)

**Interfaces:**
- Consumes: 现有 `generateId`, `readWhispers`, `writeWhispers`, `addWhisper`
- Produces: `WHIS-` 前缀生效, whispers 表有 `signed`/`signTime` 列, `getReportedContent('whisper', id)` 可用

- [ ] **Step 1: uniqueId.js 加 WHIS 前缀**

```js
// VALID_PREFIXES 增加 'WHIS'
const VALID_PREFIXES = ['POST', 'POCM', 'DISC', 'DICM', 'QAQU', 'QAAN', 'VOTE', 'AURQ', 'REPO', 'PUNI', 'APP', 'WHIS'];
```

- [ ] **Step 2: db.js whispers 表列迁移**

在 `migrate()` 的列迁移区域（现有列迁移代码旁）增加：
```js
// whispers 表列迁移 — signed / signTime
const whisperCols = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='whispers'").pluck().get() || '';
if (!whisperCols.includes('"signed"')) {
  d.exec(`ALTER TABLE "whispers" ADD COLUMN "signed" INTEGER DEFAULT 0`);
}
if (!whisperCols.includes('"signTime"')) {
  d.exec(`ALTER TABLE "whispers" ADD COLUMN "signTime" TEXT`);
}
```

- [ ] **Step 3: lib/penalty.js 的 getReportedContent 增加 whisper 分支**

```js
if (type === 'whisper') {
  const w = db.readWhispers().find(x => x.id === targetId);
  if (w) return { content: w.content || '', images: [], author: w.senderName, userId: w.senderId };
}
```

放入 `getReportedContent()` 函数的 switch 链中（在 auction 分支前）。

### Task 2: 后端路由 — routes/whispers.js

**Files:**
- Create: `routes/whispers.js`
- Modify: `server.js` (挂载新路由)

**Interfaces:**
- Consumes: `verifyUserToken`, `readWhispers`, `addWhisper`, `generateId`, `checkSensitive`, `checkBullyingNames`, `isFeatureBlocked`, `emitUserNotice`, `getReportedContent`
- Produces: `POST /api/whispers`, `GET /api/whispers/inbox`, `POST /api/whispers/:id/sign`

- [ ] **Step 1: 创建 routes/whispers.js**

完整路由文件：

```js
const { verifyUserToken } = require('../lib/crypto');
const { broadcastSSE } = require('../lib/sse');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked, emitUserNotice, getReportedContent } = require('../lib/penalty');
const db = require('../db');

const WHISPER_MAX_LENGTH = 50;

module.exports = function(app) {

  // POST /api/whispers — 发送悄悄话
  app.post('/api/whispers', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const { receiverId, content } = req.body;
    if (!receiverId || !content) return res.json({ ok: false, msg: '接收者和内容不能为空' });
    if (content.length > WHISPER_MAX_LENGTH) return res.json({ ok: false, msg: '内容不能超过' + WHISPER_MAX_LENGTH + '字' });
    if (receiverId === session.id) return res.json({ ok: false, msg: '不能给自己发悄悄话' });

    // 处罚检测
    if (isFeatureBlocked(session.id, 'whisper')) {
      return res.json({ ok: false, msg: '当前账号功能受限，无法发送悄悄话', code: 'FEATURE_BLOCKED' });
    }

    // 敏感词检测
    const sensitiveWords = checkSensitive(content);
    if (sensitiveWords.length > 0) {
      return res.json({ ok: false, msg: '内容包含敏感词，请修改后重试', code: 'SENSITIVE_WORDS', warningMsg: '内容包含敏感词，请修改后重试' });
    }

    // 霸凌名称检测
    const blockedNames = checkBullyingNames(content);
    if (blockedNames.length > 0) {
      return res.json({ ok: false, msg: '内容包含受保护名称，请修改后重试', code: 'BULLYING_NAME', warningMsg: '内容包含受保护名称' });
    }

    // 验证接收者存在
    const users = db.readUsers();
    const receiver = users.find(u => u.id === receiverId && u.status !== 'banned');
    if (!receiver) return res.json({ ok: false, msg: '接收用户不存在或已被封禁' });

    // 生成本地读取的 senderName
    const sender = users.find(u => u.id === session.id);
    if (!sender) return res.json({ ok: false, msg: '发送者不存在' });

    const whisperId = generateId('WHIS');
    const now = new Date().toISOString();
    const whisper = {
      id: whisperId,
      senderId: session.id,
      senderName: sender.nickname || sender.username,
      receiverId: receiverId,
      receiverName: receiver.nickname || receiver.username,
      content: content,
      notifLevel: 'T1',
      createdAt: now,
      deleted: 0,
      signed: 0,
      signTime: null
    };

    db.addWhisper(whisper);
    logIdAssignment('whisper', whisperId, content.substring(0, 100), db);

    // 给接收方发 T1 通知
    emitUserNotice(receiverId, '💬 收到一条悄悄话',
      '有人给你发了一条悄悄话，快去查看吧', 'T1');

    res.json({ ok: true, data: { id: whisperId } });
  });

  // GET /api/whispers/inbox — 收到的悄悄话
  app.get('/api/whispers/inbox', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const all = db.readWhispers();
    const mine = all.filter(w => w.receiverId === session.id && !w.deleted)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, data: mine });
  });

  // POST /api/whispers/:id/sign — 签收悄悄话
  app.post('/api/whispers/:id/sign', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const all = db.readWhispers();
    const whisper = all.find(w => w.id === req.params.id);
    if (!whisper) return res.json({ ok: false, msg: '悄悄话不存在' });
    if (whisper.receiverId !== session.id) return res.json({ ok: false, msg: '无权操作' });
    if (whisper.signed) return res.json({ ok: false, msg: '已签收' });

    whisper.signed = 1;
    whisper.signTime = new Date().toISOString();
    db.writeWhispers(all);

    // 通知发送方已签收
    emitUserNotice(whisper.senderId, '💬 悄悄话已签收',
      whisper.receiverName + ' 已签收你的悄悄话', 'T1');

    res.json({ ok: true });
  });
};
```

- [ ] **Step 2: server.js 挂载新路由**

在 `require('./routes/student-council')(app);` 之后、`require('./routes/maintenance')(app);` 之前加入：
```js
require('./routes/whispers')(app);
```

### Task 3: 前端 — index.html UI

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在 action bar 新增「悄悄话」按钮**

在 `<!-- 找人 -->` 按钮之前插入：
```html
<button class="compose-btn" style="background:#fce4ec;color:#880e4f;border:1.5px solid #f48fb1;" type="button" onclick="openWhisperModal()">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
  </svg>
  <span class="btn-label">悄悄话</span>
</button>
```

- [ ] **Step 2: 添加发悄悄话弹窗 HTML**

在 `<!-- 举报弹窗 -->` 前添加模态弹窗 HTML：
```html
<!-- ===== 悄悄话弹窗 ===== -->
<div class="modal-overlay" id="whisperModalOverlay" onclick="closeWhisperModal(event)" style="display:none">
<div class="modal-note whisper-modal" onclick="event.stopPropagation()" style="max-width:400px;">
<div class="tape" style="--tape-rotate:2deg;"></div>
<h3><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="12" x2="15" y2="12"/></svg> 发悄悄话</h3>
<div class="whisper-search-area" style="margin-bottom:10px;">
  <input type="text" id="whisperSearchInput" placeholder="搜索接收用户..." autocomplete="off" style="width:100%;padding:8px 10px;border:1.5px solid #d4c4b0;border-radius:6px;font-size:13px;background:#faf6f0;" oninput="whisperSearch(this.value)">
  <div id="whisperSearchResults" style="max-height:160px;overflow-y:auto;margin-top:4px;border-radius:6px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.1);display:none;"></div>
</div>
<div id="whisperSelectedUser" style="display:none;padding:6px 8px;background:#f0e6d8;border-radius:6px;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px;">
  <span id="whisperSelectedLabel"></span>
  <span style="margin-left:auto;cursor:pointer;color:#b71c1c;font-weight:bold;" onclick="clearWhisperUser()">✕</span>
</div>
<textarea id="whisperContent" placeholder="想对 TA 说什么悄悄话..." maxlength="50" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid #d4c4b0;border-radius:6px;font-size:13px;resize:none;background:#faf6f0;box-sizing:border-box;"></textarea>
<div style="text-align:right;font-size:11px;color:rgba(90,74,0,0.5);margin-top:2px;"><span id="whisperCount">0</span>/50</div>
<div class="modal-actions" style="margin-top:10px;">
  <button class="modal-cancel" onclick="closeWhisperModal()">取消</button>
  <button class="modal-submit" onclick="submitWhisper()">发送 <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
</div>
</div>
</div>
```

- [ ] **Step 3: 添加接收悄悄话弹出通知 HTML**

在 `<!-- ===== 悄悄话弹窗 ===== -->` 后添加（在举报弹窗前）：
```html
<!-- ===== 悄悄话接收通知弹窗 ===== -->
<div class="modal-overlay" id="whisperIncomingOverlay" onclick="closeWhisperIncoming(event)" style="display:none">
<div class="modal-note whisper-incoming-modal" onclick="event.stopPropagation()" style="max-width:380px;">
<div class="tape" style="--tape-rotate:-1deg;"></div>
<h3><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 💬 你收到一条悄悄话</h3>
<div id="whisperIncomingContent" style="background:#faf6f0;border-radius:8px;padding:12px;margin:8px 0;font-size:14px;line-height:1.6;"></div>
<div style="display:flex;gap:8px;margin-top:10px;">
  <button class="modal-cancel" style="flex:1;" onclick="reportCurrentWhisper()">举报</button>
  <button class="modal-submit" style="flex:2;" onclick="signCurrentWhisper()">签收</button>
</div>
</div>
</div>
```

- [ ] **Step 4: 添加 CSS 样式**

在 CSS 区域添加（在适当的 style 块内或指定位置）：
```css
.whisper-modal .whisper-search-area input:focus { outline:none; border-color:#c4897a; }
.whisper-search-result-item { padding:8px 10px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:13px; border-bottom:1px solid #f0e6d8; transition:background 0.15s; }
.whisper-search-result-item:hover { background:#f5ede4; }
.whisper-search-result-item:last-child { border-bottom:none; }
.whisper-incoming-modal { animation: fadeSlideIn 0.25s ease-out; }
@keyframes fadeSlideIn { from { opacity:0; transform:translateY(-12px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
```

- [ ] **Step 5: 添加 JavaScript 逻辑**

在 index.html 的 JS 区域（靠近其他弹窗函数附近）添加：

```js
// ===== 悄悄话功能 =====
var _whisperSearchTimer = null;
var _whisperSelectedUserId = null;
var _whisperSelectedUserName = null;
var _currentIncomingWhisperId = null;

function openWhisperModal() {
  var overlay = document.getElementById('whisperModalOverlay');
  if (!overlay) return;
  var token = localStorage.getItem('campus_user_token');
  if (!token) { alert('请先登录'); return; }
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('whisperSearchInput').value = '';
  document.getElementById('whisperSearchResults').style.display = 'none';
  document.getElementById('whisperSearchResults').innerHTML = '';
  clearWhisperUser();
  document.getElementById('whisperContent').value = '';
  document.getElementById('whisperCount').textContent = '0';
  setTimeout(function() { document.getElementById('whisperSearchInput').focus(); }, 200);
}

function closeWhisperModal(e) {
  if (e && e.target !== e.currentTarget) return;
  var overlay = document.getElementById('whisperModalOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function whisperSearch(q) {
  q = q.trim();
  var resultsEl = document.getElementById('whisperSearchResults');
  if (!q) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
  if (_whisperSearchTimer) clearTimeout(_whisperSearchTimer);
  _whisperSearchTimer = setTimeout(function() {
    var token = localStorage.getItem('campus_user_token');
    var headers = {};
    if (token) headers['x-user-token'] = token;
    fetch('/api/users/search?q=' + encodeURIComponent(q), { headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (!j.ok || !j.data) { resultsEl.innerHTML = '<div style="padding:12px;color:#999;font-size:13px;text-align:center;">搜索出错</div>'; resultsEl.style.display = 'block'; return; }
        var d = j.data;
        var items = (d.accounts || []).concat(d.nicknames || []).concat(d.uids || []).concat(d.names || []);
        var deduped = [];
        var seen = {};
        items.forEach(function(u) {
          if (!seen[u.id]) { seen[u.id] = true; deduped.push(u); }
        });
        if (deduped.length === 0) { resultsEl.innerHTML = '<div style="padding:12px;color:#999;font-size:13px;text-align:center;">未找到匹配用户</div>'; resultsEl.style.display = 'block'; return; }
        var html = '';
        deduped.forEach(function(u) {
          var avatarHtml = u.avatar ? '<img src="' + escHtml(u.avatar) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">' : '<span style="width:28px;height:28px;border-radius:50%;background:#d4c4b0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#5a4030;flex-shrink:0;">' + escHtml((u.nickname || '?')[0]) + '</span>';
          html += '<div class="whisper-search-result-item" onclick="selectWhisperUser(\'' + escHtml(u.id) + '\',\'' + escHtml(u.nickname || u.username) + '\')">' + avatarHtml + '<span>' + escHtml(u.nickname || u.username) + '</span></div>';
        });
        resultsEl.innerHTML = html;
        resultsEl.style.display = 'block';
      })
      .catch(function() { resultsEl.innerHTML = '<div style="padding:12px;color:#999;font-size:13px;text-align:center;">网络错误</div>'; resultsEl.style.display = 'block'; });
  }, 300);
}

function selectWhisperUser(id, name) {
  _whisperSelectedUserId = id;
  _whisperSelectedUserName = name;
  document.getElementById('whisperSelectedLabel').textContent = '发送给: ' + name;
  document.getElementById('whisperSelectedUser').style.display = 'flex';
  document.getElementById('whisperSearchResults').style.display = 'none';
  document.getElementById('whisperSearchInput').value = '';
  document.getElementById('whisperContent').focus();
}

function clearWhisperUser() {
  _whisperSelectedUserId = null;
  _whisperSelectedUserName = null;
  document.getElementById('whisperSelectedUser').style.display = 'none';
}

function submitWhisper() {
  if (!_whisperSelectedUserId) { alert('请选择接收用户'); return; }
  var content = document.getElementById('whisperContent').value.trim();
  if (!content) { alert('请输入内容'); return; }
  var token = localStorage.getItem('campus_user_token');
  if (!token) { alert('请先登录'); return; }
  fetch('/api/whispers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-token': token },
    body: JSON.stringify({ receiverId: _whisperSelectedUserId, content: content })
  })
  .then(function(r) { return r.json(); })
  .then(function(j) {
    if (j.ok) { closeWhisperModal(); showToast('悄悄话已发送'); }
    else if (j.code === 'SENSITIVE_WORDS' || j.code === 'BULLYING_NAME') {
      alert(j.warningMsg || j.msg);
    } else { alert(j.msg || '发送失败'); }
  })
  .catch(function() { alert('网络错误'); });
}

// 悄悄话接收 — 监听未签收的
function checkIncomingWhispers() {
  var token = localStorage.getItem('campus_user_token');
  if (!token) return;
  fetch('/api/whispers/inbox', { headers: { 'x-user-token': token } })
    .then(function(r) { return r.json(); })
    .then(function(j) {
      if (!j.ok) return;
      var unsigned = j.data.filter(function(w) { return !w.signed; });
      if (unsigned.length > 0) {
        // 显示最新一条未签收
        showWhisperIncoming(unsigned[0]);
      }
    })
    .catch(function() {});
}

function showWhisperIncoming(whisper) {
  _currentIncomingWhisperId = whisper.id;
  var contentEl = document.getElementById('whisperIncomingContent');
  contentEl.innerHTML = '<div style="margin-bottom:6px;"><strong>' + escHtml(whisper.senderName) + '</strong> 给你发送了一条悄悄话</div><div style="color:#5a4030;padding:8px;border-left:3px solid #f48fb1;background:#fff;border-radius:4px;">' + escHtml(whisper.content) + '</div><div style="margin-top:6px;font-size:11px;color:#999;">发送时间: ' + whisper.createdAt + '</div>';
  document.getElementById('whisperIncomingOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeWhisperIncoming(e) {
  if (e && e.target !== e.currentTarget) return;
  var overlay = document.getElementById('whisperIncomingOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function signCurrentWhisper() {
  if (!_currentIncomingWhisperId) return;
  var token = localStorage.getItem('campus_user_token');
  if (!token) return;
  fetch('/api/whispers/' + _currentIncomingWhisperId + '/sign', {
    method: 'POST',
    headers: { 'x-user-token': token }
  })
  .then(function(r) { return r.json(); })
  .then(function(j) {
    if (j.ok) {
      showToast('✅ 已签收');
      closeWhisperIncoming();
      _currentIncomingWhisperId = null;
    } else { alert(j.msg || '操作失败'); }
  })
  .catch(function() { alert('网络错误'); });
}

function reportCurrentWhisper() {
  if (!_currentIncomingWhisperId) return;
  var token = localStorage.getItem('campus_user_token');
  if (!token) return;
  // 通过统一举报接口
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-token': token },
    body: JSON.stringify({ type: 'whisper', targetId: _currentIncomingWhisperId, reason: '收到违规悄悄话' })
  })
  .then(function(r) { return r.json(); })
  .then(function(j) {
    if (j.ok) { showToast('举报已提交'); closeWhisperIncoming(); }
    else { alert(j.msg || '举报失败'); }
  })
  .catch(function() { alert('网络错误'); });
}

// 在页面加载时与 SSE 事件触发时检查新悄悄话
// 在 document.addEventListener('DOMContentLoaded', ...) 内加 checkIncomingWhispers()
// 在 SSE onmessage 处理中加 checkIncomingWhispers()
```

- [ ] **Step 6: 在页面加载和 SSE 事件中集成**

在 `DOMContentLoaded` 中（找到现有代码）加入：
```js
// 加载完成后检查未签收悄悄话
setTimeout(checkIncomingWhispers, 2000);
```

在 SSE `onmessage` 事件处理中，当 eventId 为 `noticeUpdate` 时：
```js
// 现有 SSE 代码中找到处理 noticeUpdate 的地方，加入:
checkIncomingWhispers();
```

- [ ] **Step 7: 在 textarea 上添加字数统计事件**

```js
document.getElementById('whisperContent').addEventListener('input', function() {
  document.getElementById('whisperCount').textContent = this.value.length;
});
```

### Task 4: 更新文档

**Files:**
- Modify: `docs_for_agent.md`

- [ ] **Step 1: 在会话变更日志新增记录**

在文档底部新增本次会话记录：
- `routes/whispers.js` 新建
- `lib/uniqueId.js` 加 WHIS 前缀
- `db.js` whispers 表加列迁移
- `lib/penalty.js` getReportedContent 加 whisper
- `server.js` 挂载新路由
- `index.html` 新增悄悄话UI
