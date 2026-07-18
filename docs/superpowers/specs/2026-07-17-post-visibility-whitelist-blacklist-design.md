# 帖子可见性扩展设计：仅指定用户可见 / 仅指定用户不可见

## 概述

在现有 `visibility` 字段（`public` / `self_only`）基础上，扩展支持 `whitelist`（仅指定用户可见）和 `blacklist`（仅指定用户不可见）两种可见性模式，三者与 `self_only` 互斥。发帖者在发帖窗口通过「更多选项」选择目标用户（多选，复用 `/api/users/search` 接口）。

## 数据模型

在 `db.js` 的 `posts` 表迁移中新增两列：

| 列 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| `visibleTo` | TEXT | `'[]'` | JSON 数组，白名单用户 ID 列表 |
| `invisibleTo` | TEXT | `'[]'` | JSON 数组，黑名单用户 ID 列表 |

`visibility` 字段取值扩展为：`'public'` / `'self_only'` / `'whitelist'` / `'blacklist'`。

## 后端（routes/posts.js）

### POST /api/posts

请求体新增参数：`visibleTo`（数组）、`invisibleTo`（数组）。`submitNote()` 确定的 `visibility` 值传入 `createPost()`。

逻辑：
- 若 `visibility === 'whitelist'`：`finalVisibility = 'whitelist'`，`newPost.visibleTo = JSON.stringify(visibleTo)`
- 若 `visibility === 'blacklist'`：`finalVisibility = 'blacklist'`，`newPost.invisibleTo = JSON.stringify(invisibleTo)`
- 敏感词 `sensitiveForce` 仍覆盖为 `self_only`
- 三个选项互斥逻辑在前端处理，后端只存储收到的值

### GET /api/posts（列表）

在现有 `self_only` 过滤逻辑后追加：

```javascript
// whitelist 过滤：仅作者 + 白名单用户可见
if (p.visibility === 'whitelist') {
  if (!p.userId || !currentUserId || p.userId !== currentUserId) {
    const vt = Array.isArray(p.visibleTo) ? p.visibleTo : tryParse(p.visibleTo, []);
    if (!vt.includes(currentUserId)) return false;
  }
}
// blacklist 过滤：黑名单用户不可见（作者始终可见）
if (p.visibility === 'blacklist') {
  if (currentUserId && p.userId !== currentUserId) {
    const ivt = Array.isArray(p.invisibleTo) ? p.invisibleTo : tryParse(p.invisibleTo, []);
    if (ivt.includes(currentUserId)) return false;
  }
}
```

### GET /api/posts/:id（详情）

在现有 `self_only` 拦截后追加：

```javascript
if (post.visibility === 'whitelist') {
  if (!isOwner) {
    const vt = Array.isArray(post.visibleTo) ? post.visibleTo : tryParse(post.visibleTo, []);
    if (!currentUserId || !vt.includes(currentUserId)) {
      return res.json({ ok: false, msg: '此内容仅指定用户可见', code: 'WHITELIST_BLOCKED' });
    }
  }
}
if (post.visibility === 'blacklist') {
  if (!isOwner) {
    const ivt = Array.isArray(post.invisibleTo) ? post.invisibleTo : tryParse(post.invisibleTo, []);
    if (currentUserId && ivt.includes(currentUserId)) {
      return res.json({ ok: false, msg: '此内容对你不可见', code: 'BLACKLIST_BLOCKED' });
    }
  }
}
```

## 前端（index.html）

### 发帖「更多选项」区域改动

在 `#postMoreOptions` 中，现有 `selfOnlyPost` 复选框下方新增两行：

```html
<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:#7a5a2a;">
  <input type="checkbox" id="whitelistPost" style="width:14px;height:14px;cursor:pointer;">
  <label for="whitelistPost" style="margin:0;cursor:pointer;">
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见
  </label>
</div>
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:#7a5a2a;">
  <input type="checkbox" id="blacklistPost" style="width:14px;height:14px;cursor:pointer;">
  <label for="blacklistPost" style="margin:0;cursor:pointer;">
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见
  </label>
</div>
```

后续跟一个用户搜索选择区域（`#visibilityUserArea`，默认隐藏，选 whitelist/blacklist 时展开）：

```html
<div id="visibilityUserArea" style="display:none;margin-top:6px;">
  <div style="position:relative;">
    <input type="text" id="visibilityUserSearch" placeholder="搜索用户..." autocomplete="off"
      style="width:100%;padding:6px 10px;border:1px solid rgba(90,74,0,0.2);border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box;">
    <div id="visibilitySearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0d8cc;border-radius:6px;max-height:160px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
  </div>
  <div id="visibilitySelectedUsers" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;"></div>
</div>
```

### JS 逻辑

**互斥逻辑**：`selfOnlyPost` 与 `whitelistPost` / `blacklistPost` 互斥（任一勾选时清除其它）。通过三个 checkbox 的 `onchange` 事件处理。

**用户搜索**：`visibilityUserSearch` 的 `oninput` 触发 300ms 防抖搜索，调 `GET /api/users/search?q=xxx`，结果渲染到 `#visibilitySearchResults`（复用 whisper 搜索模式，四类分组）。点击结果项将该用户加入已选列表。

**多选用户**：已选用户以标签芯片显示在 `#visibilitySelectedUsers`，每个带 X 移除按钮。以数组 `_visibilityTargetUsers` 存储 `{id, nickname, avatar}` 对象。

**提交发帖**：`submitNote()` 新增逻辑 —— 根据勾选的 visibility 选项和 `_visibilityTargetUsers` 数组，确定 `visibility` 和 `visibleTo`/`invisibleTo` 参数传给 `createPost()`。

**弹窗打开重置**：`openModal()` 和 `closeModal()` 中重置新增的 checkbox 和用户选择区域。

**帖子卡片渲染**（`renderNotes` 中的 `note-type` 行）：追加 `whitelist` / `blacklist` 的显示标识。

**详情弹窗**（`openNoteDetail`）：处理 `WHITELIST_BLOCKED` / `BLACKLIST_BLOCKED` 错误码。

## 前端（post.html）

`renderPost()` 中追加：

```javascript
let visibilityBanner = '';
if (post.visibility === 'whitelist') {
  visibilityBanner = '<div class="self-only-banner"><svg ...></svg> 此内容<b>仅指定用户</b>可见</div>';
} else if (post.visibility === 'blacklist') {
  visibilityBanner = '<div class="self-only-banner"><svg ...></svg> 此内容<b>对部分用户</b>不可见</div>';
} else if (post.visibility === 'self_only') {
  visibilityBanner = '<div class="self-only-banner"><svg ...></svg> 这是一条<b>仅你可见</b>的帖子</div>';
}
```

## 测试要点（写入 todo.md）

1. 发帖时勾选「仅指定用户可见」并搜索选择 2 个用户 → 帖子创建成功，可见性为 `whitelist`
2. 被选中的用户登录后可在首页看到该帖子 → 卡片标识正确，`post.html` 横幅正确
3. 未选中的用户登录后首页看不到该帖子 → 直接访问 `post.html?id=` 返回 `WHITELIST_BLOCKED`
4. 发帖者始终能看到该帖子
5. 发帖时勾选「仅指定用户不可见」并选择 2 个用户 → 帖子创建成功
6. 被选中的用户登录后首页看不到帖子 → 直接访问返回 `BLACKLIST_BLOCKED`
7. 未选中的普通用户能看到该帖子
8. 互斥验证：选「仅自己可见」后自动取消「仅指定用户可见」
9. 选「仅指定用户可见」后自动取消「仅自己可见」
10. 敏感词检测：命中敏感词时无视 whitelist/blacklist 强制设为 self_only
11. 空搜索验证：至少 2 个字符才搜索
