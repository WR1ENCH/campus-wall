# 帖子可见性扩展（白名单/黑名单）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在帖子「更多选项」中新增「仅指定用户可见」和「仅指定用户不可见」两个选项，支持多选用户，与「仅自己可见」互斥。

**Architecture:** 后端扩展 `posts` 表 `visibility` 字段取值 + 新增 `visibleTo`/`invisibleTo` 列；前端在 `index.html` 发帖弹窗新增选项与用户搜索多选组件，在卡片和详情页显示对应标识。

**Tech Stack:** Node.js + Express + SQLite (better-sqlite3), 原生 HTML/CSS/JS

## Global Constraints

- 能不新增文件就不新增，在原有文件基础上修改
- `inputSanitize` 白名单字段：新增 body 参数 `visibleTo`/`invisibleTo` 必须加入白名单
- 可见性三个选项互斥，但发帖者始终可见
- 复用 `GET /api/users/search` 接口做用户搜索
- 搜索至少 2 个非空格字符

---

### Task 1: DB 迁移 + 后端创建帖子支持新可见性

**Files:**
- Modify: `db.js` — 列迁移 + posts 表定义加 `visibleTo`/`invisibleTo`
- Modify: `routes/posts.js` — POST /api/posts 接受并存储新参数

**Interfaces:**
- Produces: `POST /api/posts` 接受 `visibility='whitelist'|'blacklist'` + `visibleTo`(array) / `invisibleTo`(array)

- [ ] **Step 1: db.js — 列迁移 + 表定义**

在 `db.js` 的 `migrate()` 中找到 posts 表建表语句，在 `visibility` 和 `allowComments` 行后追加两列：

```javascript
// 在 migrate() 的 posts 表定义中追加
"visibleTo" TEXT DEFAULT '[]',
"invisibleTo" TEXT DEFAULT '[]'
```

在列迁移的 `ALTER TABLE` 块中追加：

```javascript
try { db.exec(`ALTER TABLE "posts" ADD COLUMN "visibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE "posts" ADD COLUMN "invisibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
```

在 `tableMigrations` 的 `posts` 列数组末尾追加：

```javascript
{ name: 'posts', columns: ['type', 'likes', 'images', 'discussionId', 'likedBy', 'comments', 'commentsCount', 'liked', 'rotate', 'zIndex', 'isAnonymous', 'visibility', 'allowComments', 'visibleTo', 'invisibleTo'] },
```

- [ ] **Step 2: routes/posts.js — POST /api/posts 接受新参数**

在 `POST /api/posts` 的 destructure 行（约 line 197）追加 `visibleTo` 和 `invisibleTo`：

```javascript
const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo } = req.body;
```

在 `finalVisibility` 计算块（约 line 287）扩展逻辑：

```javascript
const finalVisibility = (hasSensitive && visibility !== 'self_only') ? 'self_only'
  : (visibility === 'self_only' ? 'self_only'
    : (visibility === 'whitelist' ? 'whitelist'
      : (visibility === 'blacklist' ? 'blacklist' : 'public')));
```

在 `newPost` 对象中追加两字段：

```javascript
visibleTo: visibility === 'whitelist' ? (Array.isArray(visibleTo) ? visibleTo : []) : undefined,
invisibleTo: visibility === 'blacklist' ? (Array.isArray(invisibleTo) ? invisibleTo : []) : undefined,
```

> 注意：`dropAndInsert` 会序列化为 JSON 字符串存储（sqlite TEXT 列）

- [ ] **Step 3: 验证编译**

```bash
node -c routes/posts.js && node -c db.js
```

预期：无错误输出


### Task 2: 后端读取 — GET /api/posts 列表过滤 + GET /api/posts/:id 详情拦截

**Files:**
- Modify: `routes/posts.js` — GET 列表和详情增加 whitelist/blacklist 检查

**Interfaces:**
- Consumes: `POST /api/posts` 写入的 `visibleTo`/`invisibleTo` 字段
- Produces: `GET /api/posts` 按可见性过滤；`GET /api/posts/:id` 返回 `WHITELIST_BLOCKED` / `BLACKLIST_BLOCKED`

- [ ] **Step 1: GET /api/posts 添加 whitelist/blacklist 过滤**

在 `self_only` 过滤块之后（约 line 99-104），追加两个新的 `else if`：

```javascript
activePosts = activePosts.filter(p => {
  if (p.visibility === 'self_only') {
    return p.userId && currentUserId && p.userId === currentUserId;
  }
  // 白名单：仅作者和 visibleTo 中的用户可见
  if (p.visibility === 'whitelist') {
    if (p.userId && currentUserId && p.userId === currentUserId) return true;
    if (!currentUserId) return false;
    const vt = Array.isArray(p.visibleTo) ? p.visibleTo : [];
    return vt.includes(currentUserId);
  }
  // 黑名单：不在 invisibleTo 中的用户可见（作者始终可见）
  if (p.visibility === 'blacklist') {
    if (p.userId && currentUserId && p.userId === currentUserId) return true;
    if (!currentUserId) return true;
    const ivt = Array.isArray(p.invisibleTo) ? p.invisibleTo : [];
    return !ivt.includes(currentUserId);
  }
  return true;
});
```

- [ ] **Step 2: GET /api/posts/:id 添加 whitelist/blacklist 拦截**

在 `self_only` 拦截块（约 line 149-159）之后追加：

```javascript
// 白名单：非作者且不在 visibleTo 中不可查看
if (post.visibility === 'whitelist') {
  const token2 = req.headers['x-user-token'];
  let currentUserId2 = null;
  let isOwner2 = false;
  if (token2) {
    const session2 = verifyUserToken(token2);
    if (session2) {
      currentUserId2 = session2.id;
      if (post.userId && session2.id === post.userId) isOwner2 = true;
    }
  }
  if (!isOwner2) {
    const vt = Array.isArray(post.visibleTo) ? post.visibleTo : [];
    if (!currentUserId2 || !vt.includes(currentUserId2)) {
      return res.json({ ok: false, msg: '此内容仅指定用户可见', code: 'WHITELIST_BLOCKED' });
    }
  }
}
// 黑名单：在 invisibleTo 中的用户不可查看（作者除外）
if (post.visibility === 'blacklist') {
  const token3 = req.headers['x-user-token'];
  let currentUserId3 = null;
  let isOwner3 = false;
  if (token3) {
    const session3 = verifyUserToken(token3);
    if (session3) {
      currentUserId3 = session3.id;
      if (post.userId && session3.id === post.userId) isOwner3 = true;
    }
  }
  if (!isOwner3 && currentUserId3) {
    const ivt = Array.isArray(post.invisibleTo) ? post.invisibleTo : [];
    if (ivt.includes(currentUserId3)) {
      return res.json({ ok: false, msg: '此内容对你不可见', code: 'BLACKLIST_BLOCKED' });
    }
  }
}
```

- [ ] **Step 3: 验证语法**

```bash
node -c routes/posts.js
```

预期：无错误


### Task 3: 前端发帖窗口 — 新增可见性选项 + 用户搜索多选

**Files:**
- Modify: `index.html` — 发帖弹窗「更多选项」区域、JS 逻辑

- [ ] **Step 1: 在「更多选项」区域追加两个新选项**

在 `selfOnlyPost` 所在 div（约 line 2416-2421）之后插入：

```html
<!-- 在上面的 selfOnlyPost div 之后插入 -->
<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:#7a5a2a;">
  <input type="checkbox" id="whitelistPost" style="width:14px;height:14px;cursor:pointer;" onchange="onVisibilityOptionChange()">
  <label for="whitelistPost" style="margin:0;cursor:pointer;">
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见
  </label>
</div>
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:#7a5a2a;">
  <input type="checkbox" id="blacklistPost" style="width:14px;height:14px;cursor:pointer;" onchange="onVisibilityOptionChange()">
  <label for="blacklistPost" style="margin:0;cursor:pointer;">
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见
  </label>
</div>
```

在 `allowComments` div 之后追加用户搜索区域（约 line 2427 后）：

```html
<div id="visibilityUserArea" style="display:none;margin-top:8px;">
  <div style="position:relative;">
    <input type="text" id="visibilityUserSearch" placeholder="搜索用户..." autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid rgba(90,74,0,0.2);border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box;">
    <div id="visibilitySearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0d8cc;border-radius:6px;max-height:160px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);font-size:12px;"></div>
  </div>
  <div id="visibilitySelectedUsers" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;"></div>
</div>
```

- [ ] **Step 2: 给 `selfOnlyPost` checkbox 添加 onchange**

修改现有 `selfOnlyPost` 的 HTML（约 line 2417）：添加 `onchange="onVisibilityOptionChange()"`。

- [ ] **Step 3: 添加 visibility 互斥 + 搜索 JS 函数**

在 `openModal()` 函数之前的合适位置（约 line 5461 前的 JS 区）添加：

```javascript
var _visibilityTargetUsers = [];
var _visibilitySearchTimer = null;

function onVisibilityOptionChange() {
  var selfOnly = document.getElementById('selfOnlyPost');
  var whitelist = document.getElementById('whitelistPost');
  var blacklist = document.getElementById('blacklistPost');
  // 互斥逻辑：任一勾选时清除其它
  if (selfOnly.checked) { whitelist.checked = false; blacklist.checked = false; }
  else if (whitelist.checked) { selfOnly.checked = false; blacklist.checked = false; }
  else if (blacklist.checked) { selfOnly.checked = false; whitelist.checked = false; }
  var showSearch = whitelist.checked || blacklist.checked;
  document.getElementById('visibilityUserArea').style.display = showSearch ? 'block' : 'none';
  if (!showSearch) {
    _visibilityTargetUsers = [];
    renderVisibilitySelectedUsers();
  }
  // 从 display:none 到 block 时 input 可能还没渲染，延迟 focus
  if (showSearch) {
    setTimeout(function() { document.getElementById('visibilityUserSearch').focus(); }, 100);
  }
}

function visibilityUserSearch(q) {
  var resultsEl = document.getElementById('visibilitySearchResults');
  if (!q || q.trim().length < 2) {
    resultsEl.style.display = 'none';
    return;
  }
  if (_visibilitySearchTimer) clearTimeout(_visibilitySearchTimer);
  _visibilitySearchTimer = setTimeout(function() {
    fetch(API + '/api/users/search?q=' + encodeURIComponent(q.trim()))
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (!j.ok) return;
        var html = '';
        var sections = { accounts: '匹配账号', nicknames: '匹配昵称', uids: '匹配UID', names: '匹配姓名' };
        var hasAny = false;
        Object.keys(sections).forEach(function(key) {
          var items = j[key];
          if (items && items.length) {
            hasAny = true;
            html += '<div style="padding:4px 8px;font-size:11px;color:#999;background:#f8f6f3;">' + sections[key] + '</div>';
            items.forEach(function(user) {
              var isSelected = _visibilityTargetUsers.some(function(u) { return u.id === user.id; });
              html += '<div style="padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #f0ede8;' + (isSelected ? 'opacity:0.4;' : '') + '" onclick="addVisibilityUser(\'' + user.id + '\',\'' + escHtml(user.nickname) + '\',\'' + escHtml(user.avatar || '') + '\')">';
              if (user.avatar && user.avatar.startsWith('data:')) {
                html += '<img src="' + escHtml(user.avatar) + '" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">';
              } else {
                html += '<span style="font-size:14px;">' + (user.avatar && user.avatar.length <= 4 ? escHtml(user.avatar) : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>') + '</span>';
              }
              html += '<span>' + escHtml(user.nickname) + '</span>';
              html += '<span style="color:#999;font-size:11px;">@' + escHtml(user.username) + '</span>';
              if (user.zhixueStatus === 'approved') {
                html += '<span style="color:#4caf50;font-size:11px;">✅ 已认证</span>';
              }
              html += '</div>';
            });
          }
        });
        if (!hasAny) html = '<div style="padding:8px;color:#999;font-size:12px;text-align:center;">未找到用户</div>';
        resultsEl.innerHTML = html;
        resultsEl.style.display = 'block';
      });
  }, 300);
}

function addVisibilityUser(id, nickname, avatar) {
  if (_visibilityTargetUsers.some(function(u) { return u.id === id; })) return;
  _visibilityTargetUsers.push({ id: id, nickname: nickname, avatar: avatar });
  renderVisibilitySelectedUsers();
  document.getElementById('visibilityUserSearch').value = '';
  document.getElementById('visibilitySearchResults').style.display = 'none';
}

function removeVisibilityUser(id) {
  _visibilityTargetUsers = _visibilityTargetUsers.filter(function(u) { return u.id !== id; });
  renderVisibilitySelectedUsers();
}

function renderVisibilitySelectedUsers() {
  var container = document.getElementById('visibilitySelectedUsers');
  if (_visibilityTargetUsers.length === 0) {
    container.innerHTML = '<span style="color:#999;font-size:11px;">尚未选择用户</span>';
    return;
  }
  container.innerHTML = _visibilityTargetUsers.map(function(u) {
    var avatarHtml = u.avatar && u.avatar.startsWith('data:')
      ? '<img src="' + escHtml(u.avatar) + '" style="width:16px;height:16px;border-radius:50%;object-fit:cover;">'
      : '<span style="font-size:12px;">' + (u.avatar && u.avatar.length <= 4 ? escHtml(u.avatar) : '👤') + '</span>';
    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px 2px 4px;background:rgba(90,74,0,0.08);border-radius:12px;font-size:11px;color:#5a4a00;">'
      + avatarHtml
      + '<span>' + escHtml(u.nickname) + '</span>'
      + '<span style="cursor:pointer;color:#c00;margin-left:2px;" onclick="removeVisibilityUser(\'' + u.id + '\')">✕</span>'
      + '</span>';
  }).join('');
}
```

- [ ] **Step 4: setup 搜索 input 的 oninput**

在 `selfOnlyPost` 的 `onchange` 改为 `onchange="onVisibilityOptionChange.call(this)"`。

然后在 JS 区域（`openModal` 前）添加搜索 input 的事件绑定：

```javascript
// visibility 用户搜索的 input 绑定（之后在 DOM 中用 addEventListener）
```

实际上改为用 `oninput` 属性更简单：将 `visibilityUserSearch` input 的 HTML 改为 `oninput="visibilityUserSearch(this.value)"`。

同时在 JS 中确保 `visibilityUserSearch` 函数在 `closeVisibilitySearch` 逻辑上：

用户点击搜索结果外部或按 Esc 时关闭搜索下拉：
```javascript
document.addEventListener('click', function(e) {
  var area = document.getElementById('visibilityUserArea');
  if (area && area.style.display !== 'none') {
    var results = document.getElementById('visibilitySearchResults');
    var input = document.getElementById('visibilityUserSearch');
    if (results && !results.contains(e.target) && !input.contains(e.target)) {
      results.style.display = 'none';
    }
  }
});
```

- [ ] **Step 5: 修改 `submitNote()` 读取新选项**

```javascript
// 在 submitNote() 约 line 6237-6240，修改 visibility 计算逻辑
const selfOnlyChk = document.getElementById('selfOnlyPost');
const whitelistChk = document.getElementById('whitelistPost');
const blacklistChk = document.getElementById('blacklistPost');

let visibility = 'public';
let visibleTo = [];
let invisibleTo = [];
if (selfOnlyChk && selfOnlyChk.checked) {
  visibility = 'self_only';
} else if (whitelistChk && whitelistChk.checked) {
  visibility = 'whitelist';
  visibleTo = _visibilityTargetUsers.map(function(u) { return u.id; });
  if (visibleTo.length === 0) {
    showToast('请选择至少一个用户');
    return;
  }
} else if (blacklistChk && blacklistChk.checked) {
  visibility = 'blacklist';
  invisibleTo = _visibilityTargetUsers.map(function(u) { return u.id; });
  if (invisibleTo.length === 0) {
    showToast('请选择至少一个用户');
    return;
  }
}
```

- [ ] **Step 6: 修改 `createPost()` 传递新参数**

修改 `createPost` 函数签名和 body：

```javascript
async function createPost(type, content, sensitiveForce = false, isAnonymous = false, visibility = 'public', allowComments = true, visibleTo = [], invisibleTo = []) {
```

在 fetch body 中追加：
```javascript
body: JSON.stringify({ type, content, avatar, author, userId, sensitiveForce, images: postImages, syncDiscussionId: _selectedDiscussionId, isAnonymous, visibility, allowComments, visibleTo, invisibleTo })
```

在 `pendingPostData` 中也追加：
```javascript
pendingPostData = { type, content, sensitiveForce, images: postImages.slice(), isAnonymous, visibility, allowComments, visibleTo, invisibleTo };
```

在 `resubmit` 函数中（约 line 5161）也追加：
```javascript
const { type, content, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo } = pendingPostData;
```

并修改 `createPost` 的第三次调用 —— 敏感词继续发送：
```javascript
const result = await createPost(type, content, true, isAnonymous, visibility, allowComments, visibleTo, invisibleTo);
```

- [ ] **Step 7: 修改 `openModal()` 和 `closeModal()` 重置新选项**

在 `openModal()` 约 line 5477-5480 后追加：
```javascript
const whitelistChk = document.getElementById('whitelistPost');
if (whitelistChk) whitelistChk.checked = false;
const blacklistChk = document.getElementById('blacklistPost');
if (blacklistChk) blacklistChk.checked = false;
document.getElementById('visibilityUserArea').style.display = 'none';
_visibilityTargetUsers = [];
renderVisibilitySelectedUsers();
```

在 `closeModal()` 约 line 6083-6086 后追加同样逻辑。

- [ ] **Step 8: 验证语法**

```bash
node -c server.js
```

预期：无错误


### Task 4: 前端显示 — 帖子卡片标识 + 详情弹窗错误处理 + post.html 横幅

**Files:**
- Modify: `index.html` — 卡片渲染 + 详情弹窗错误处理
- Modify: `post.html` — 横幅显示

- [ ] **Step 1: index.html 卡片渲染追加新可见性标识**

在 `renderNotes` 的字符串模板中（约 line 5318 `note-type` 行），将现有的 `self_only` 判断改为：

```javascript
' · ' + (post.visibility === 'self_only'
  ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见'
  : (post.visibility === 'whitelist'
    ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见'
    : (post.visibility === 'blacklist'
      ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见'
      : ''))
```

- [ ] **Step 2: index.html 详情弹窗错误处理**

在 `openNoteDetail()` 约 line 5495-5498，在 `SELF_ONLY` 分支后追加：

```javascript
} else if (json.code === 'WHITELIST_BLOCKED') {
  showToast('<svg ...></svg> 此内容仅指定用户可见');
  return;
} else if (json.code === 'BLACKLIST_BLOCKED') {
  showToast('<svg ...></svg> 此内容对你不可见');
  return;
```

- [ ] **Step 3: post.html 横幅**

在 `renderPost()` 约 line 1184-1187 修改：

```javascript
let selfOnlyBanner = '';
if (post.visibility === 'self_only') {
  selfOnlyBanner = '<div class="self-only-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 这是一条<b>仅你可见</b>的帖子</div>';
} else if (post.visibility === 'whitelist') {
  selfOnlyBanner = '<div class="self-only-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 此内容<b>仅指定用户</b>可见</div>';
} else if (post.visibility === 'blacklist') {
  selfOnlyBanner = '<div class="self-only-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 此内容<b>对部分用户</b>不可见</div>';
}
```

- [ ] **Step 4: post.html showSelfOnly 函数也处理新错误码**

在 `loadPost()` 的 `json.code === 'SELF_ONLY'` 分支旁追加：

```javascript
} else if (json.code === 'WHITELIST_BLOCKED') {
  document.getElementById('mainContent').innerHTML = '<div class="not-found"><div class="icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>此内容仅指定用户可见</p><a class="back-link" href="index.html"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> 返回校园墙</a></div>';
} else if (json.code === 'BLACKLIST_BLOCKED') {
  document.getElementById('mainContent').innerHTML = '<div class="not-found"><div class="icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg></div><p>此内容对你不可见</p><a class="back-link" href="index.html"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> 返回校园墙</a></div>';
```

- [ ] **Step 5: 验证**

```bash
node -c routes/posts.js
```

服务器启动验证：
```bash
node server.js &
sleep 2
curl -s http://localhost:3000/api/version | head -c 200
kill %1 2>/dev/null
```

预期：服务器启动成功，API 返回版本信息


### Task 5: 更新文档

**Files:**
- Modify: `docs_for_agent.md` — 记录本次变更
- Modify/update: `graphify-out/` — 图谱更新

- [ ] **Step 1: 更新 docs_for_agent.md**

在 §3.11 发帖可见性章节新增 whitelist/blacklist 说明：
- visibility 新增 `'whitelist'` / `'blacklist'` 取值
- 新增 `visibleTo` / `invisibleTo` 字段说明
- 前后端对应关系

在最近的变更记录（§10 后）追加本次变更。

- [ ] **Step 2: 更新 graphify 图谱**

```bash
cd /home/wr1ench/campus-wall-dev_x
npx graphify . --update 2>/dev/null || true
```

- [ ] **Step 3: 更新 todo.md 写入测试内容**

按设计文档「测试要点」章节写入 `todo.md`。
