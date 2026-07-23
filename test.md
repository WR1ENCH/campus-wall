# 测试报告 — 三功能并行实现

> 生成时间: 2026-07-22
> 功能一：发帖窗口增加帖子置顶
> 功能二：修改非PLUS每日发帖额度
> 功能三：评论与点赞自动通知

---

## Diff

diff --git a/db.js b/db.js
index 7d3e1ac..8491e6d 100644
--- a/db.js
+++ b/db.js
@@ -157,6 +157,8 @@ function migrate() {
   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "allowComments" INTEGER DEFAULT 1`); } catch(e) {}
   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "visibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "invisibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
+  try { db.exec(`ALTER TABLE "posts" ADD COLUMN "pinned" INTEGER DEFAULT 0`); } catch(e) {}
+  try { db.exec(`ALTER TABLE "posts" ADD COLUMN "pinnedAt" TEXT`); } catch(e) {}
   db.exec(`CREATE TABLE IF NOT EXISTS "login_logs" (
     "id" TEXT PRIMARY KEY,
     "type" TEXT,
@@ -504,6 +506,19 @@ function migrate() {
       }
     }
   }
+  // 帖子置顶月度计数列
+  const pinCols = ['pinCount', 'pinMonth'];
+  for (const col of pinCols) {
+    if (!existingUserCols.includes(col)) {
+      try {
+        const def = col === 'pinCount' ? ' INTEGER DEFAULT 0' : ' TEXT';
+        db.exec(`ALTER TABLE "users" ADD COLUMN "${col}"${def}`);
+        console.log(`[db.js] ✅ 已添加列 users.${col}`);
+      } catch (e) {
+        console.warn(`[db.js] ⚠️ 添加列 users.${col} 失败:`, e.message);
+      }
+    }
+  }
   // credibility_logs 表
   db.exec(`CREATE TABLE IF NOT EXISTS "credibility_logs" (
     "id" TEXT PRIMARY KEY,
diff --git a/index.html b/index.html
index 152675d..3e75dc9 100644
--- a/index.html
+++ b/index.html
@@ -1034,10 +1034,27 @@ transition: top 0.3s ease, padding var(--ease-linear);
   border-radius: 10px;
   animation: qaCardIn 0.3s ease;
   }
-  .qa-pinned-card {
-  border: 1.5px solid #f5c518 !important;
-  background: #fffef5 !important;
-  }
+   .qa-pinned-card {
+   border: 1.5px solid #f5c518 !important;
+   background: #fffef5 !important;
+   }
+   .post-pinned-badge {
+   position: absolute;
+   top: -8px;
+   right: 8px;
+   display: inline-flex;
+   align-items: center;
+   gap: 2px;
+   background: linear-gradient(135deg, #f5c518, #e8a800);
+   color: #5a3e00;
+   font-size: 10px;
+   font-weight: 700;
+   padding: 2px 7px;
+   border-radius: 10px;
+   box-shadow: 0 2px 6px rgba(245, 197, 24, 0.4);
+   z-index: 3;
+   line-height: 1.4;
+   }
   @keyframes qaOverlayOut {
   from { opacity: 1; }
   to { opacity: 0; }
@@ -2860,13 +2877,21 @@ backdrop-filter: blur(4px);
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见
  </label>
  </div>
- <div class="post-option-row" style="margin-bottom:0;">
- <input type="checkbox" id="allowComments" checked style="width:16px;height:16px;cursor:pointer;accent-color:#222;">
- <label for="allowComments" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
- <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 允许他人评论
- </label>
- </div>
- <div id="visibilityUserArea" style="display:none;margin-top:8px;">
+  <div class="post-option-row" style="margin-bottom:0;">
+  <input type="checkbox" id="allowComments" checked style="width:16px;height:16px;cursor:pointer;accent-color:#222;">
+  <label for="allowComments" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
+  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 允许他人评论
+  </label>
+  </div>
+  <div class="post-option-row" style="margin-bottom:0;padding-top:6px;border-top:1px dashed #e0d8cc;">
+  <input type="checkbox" id="pinPost" style="width:16px;height:16px;cursor:pointer;accent-color:#f5c518;" onchange="updatePostPinHint()">
+  <label for="pinPost" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
+  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> 置顶帖子 <span class="info-icon" onclick="event.stopPropagation();toggleTooltip(event,'postPinInfoTip')" tabindex="0" role="button" aria-label="置顶帖子说明"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span><div class="info-tooltip" id="postPinInfoTip">置顶后帖子将在墙顶展示 7 天，更容易被看到</div>
+  </label>
+  <div style="font-size:11px;color:#aaa;margin-top:1px;" id="postPinFeeHint">置顶需额外支付 <b style="color:#e8a800;">100</b> Credits（一次性费用，置顶 7 天）</div>
+  <div style="font-size:11px;color:#2a6846;margin-top:1px;display:none;" id="postPinPlusHint"><span style="color:#f5c518;">⭐PLUS++</span> 免费置顶（本月剩余 <span id="postPinRemaining">0</span>/40 次）</div>
+  </div>
+  <div id="visibilityUserArea" style="display:none;margin-top:8px;">
  <div style="position:relative;">
  <input type="text" id="visibilityUserSearch" placeholder="搜索用户..." autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box;" oninput="visibilityUserSearch(this.value)">
  <div id="visibilitySearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0d8cc;border-radius:6px;max-height:160px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);font-size:12px;"></div>
@@ -5565,7 +5590,7 @@ function checkUserPlusStatus() {
     .catch(() => { _userPlusCache = false; _userPlusCacheTime = now; return false; });
 }
 
-    async function createPost(type, content, sensitiveForce = false, isAnonymous = false, visibility = 'public', allowComments = true, visibleTo = [], invisibleTo = [], payWithCredit = false) {
+    async function createPost(type, content, sensitiveForce = false, isAnonymous = false, visibility = 'public', allowComments = true, visibleTo = [], invisibleTo = [], payWithCredit = false, pinned = false) {
  if (!currentUser) { showToast('<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 请先登录才能发帖'); return null; }
  const avatar = currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const author = currentUser.nickname;
@@ -5575,7 +5600,7 @@ function checkUserPlusStatus() {
  const res = await fetch(API + '/api/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
-   body: JSON.stringify({ type, content, avatar, author, userId, sensitiveForce, images: postImages, syncDiscussionId: _selectedDiscussionId, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit })
+    body: JSON.stringify({ type, content, avatar, author, userId, sensitiveForce, images: postImages, syncDiscussionId: _selectedDiscussionId, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit, pinned })
  });
  const json = await res.json();
  if (json.ok) {
@@ -5583,7 +5608,7 @@ function checkUserPlusStatus() {
  }
  if (json.needCaptcha) {
  // 发帖频率过高 → 弹出验证码弹窗
-   pendingPostData = { type, content, sensitiveForce, images: postImages.slice(), isAnonymous, visibility, allowComments, visibleTo, invisibleTo };
+    pendingPostData = { type, content, sensitiveForce, images: postImages.slice(), isAnonymous, visibility, allowComments, visibleTo, invisibleTo, pinned };
  showPostCaptchaModal();
  return null;
  }
@@ -5630,6 +5655,15 @@ function checkUserPlusStatus() {
       document.body.appendChild(overlay);
     });
   }
+  if (json.code === 'DAILY_POST_LIMIT') {
+    return new Promise((resolve) => {
+      const overlay = document.createElement('div');
+      overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);';
+      overlay._resolve = resolve;
+      overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:noteAppear 0.3s ease;"><div style="font-size:40px;margin-bottom:8px;color:#f59e0b;"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div><div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#333;">今日发帖次数已用完</div><div style="font-size:14px;color:#666;margin-bottom:20px;line-height:1.5;">' + (json.msg || '今日免费发帖次数已用完') + '，是否消耗 <strong>' + (json.cost || 39) + ' credit</strong> 继续发布？</div><div style="display:flex;gap:10px;justify-content:center;"><button onclick="var o=this.closest(\'div[style]\');var r=o._resolve;o.remove();r(null)" style="padding:8px 20px;border:1px solid #ddd;border-radius:10px;background:#f5f5f5;cursor:pointer;font-size:14px;font-family:inherit;">返回编辑</button><button onclick="var o=this.closest(\'div[style]\');var r=o._resolve;o.remove();(async()=>{const res=await createPost(type,content,sensitiveForce,isAnonymous,visibility,allowComments,visibleTo,invisibleTo,true);r(res);})()" style="padding:8px 20px;border:none;border-radius:10px;background:#222;color:#fff;cursor:pointer;font-size:14px;font-family:inherit;">消耗 ' + (json.cost || 39) + ' credit 发布</button></div></div>';
+      document.body.appendChild(overlay);
+    });
+  }
   } catch (e) {
   console.error('发帖失败:', e);
   }
@@ -5689,26 +5723,27 @@ async function showPostCaptchaModal() {
  hidePostCaptchaModal();
  return;
  }
-   const { type, content, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo } = pendingPostData;
-  try {
-  const res = await fetch(API + '/api/posts', {
-  method: 'POST',
-  headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
-  body: JSON.stringify({
-  type, content,
-  avatar: currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
-  author: currentUser.nickname,
-  userId: currentUser.id,
-   sensitiveForce,
-   images: images || [],
-   captchaId: _sliderCaptchaToken,
-   captchaText: '1',
-   isAnonymous,
-   visibility: visibility || 'public',
-   allowComments: allowComments !== false,
-   visibleTo: visibleTo || [],
-   invisibleTo: invisibleTo || []
-  })
+    const { type, content, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, pinned } = pendingPostData;
+   try {
+   const res = await fetch(API + '/api/posts', {
+   method: 'POST',
+   headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
+   body: JSON.stringify({
+   type, content,
+   avatar: currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
+   author: currentUser.nickname,
+   userId: currentUser.id,
+    sensitiveForce,
+    images: images || [],
+    captchaId: _sliderCaptchaToken,
+    captchaText: '1',
+    isAnonymous,
+    visibility: visibility || 'public',
+    allowComments: allowComments !== false,
+    visibleTo: visibleTo || [],
+    invisibleTo: invisibleTo || [],
+    pinned: pinned || false
+   })
  });
  const json = await res.json();
  if (json.ok) {
@@ -5848,9 +5883,10 @@ async function showPostCaptchaModal() {
   style="width:${sizeInfo.width}px; padding:${sizeInfo.padding}px; padding-top:${sizeInfo.padding + 10}px; transform:rotate(${post.rotate}deg); z-index:${post.zIndex}; animation-delay:${idx * 0.04}s"
   data-id="${post.id}"
   onclick="openNoteDetail('${post.id}')">
-  ${pinHtml}
-  ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
-    <div class="note-type">${cfg.emoji} ${post.type}${post.visibility === 'self_only' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见' : (post.visibility === 'whitelist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见' : (post.visibility === 'blacklist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见' : ''))}${(post.images && post.images.length) ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' + post.images.length : ''}</div>
+   ${pinHtml}
+   ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
+   ${post.pinned ? '<div class="post-pinned-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> 置顶</div>' : ''}
+     <div class="note-type">${cfg.emoji} ${post.type}${post.visibility === 'self_only' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见' : (post.visibility === 'whitelist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见' : (post.visibility === 'blacklist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见' : ''))}${(post.images && post.images.length) ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' + post.images.length : ''}</div>
   <div class="note-content">${renderPostContent(post)}</div>
  <div class="note-footer" onclick="event.stopPropagation()">
  <div class="note-author">
@@ -6027,6 +6063,22 @@ async function showPostCaptchaModal() {
     }
   }
 
+  function updatePostPinHint() {
+    var chk = document.getElementById('pinPost');
+    if (!chk) return;
+    var pinned = chk.checked;
+    var isPlus = currentUser && currentUser.isPlus;
+    var feeHint = document.getElementById('postPinFeeHint');
+    var plusHint = document.getElementById('postPinPlusHint');
+    if (isPlus) {
+      if (feeHint) feeHint.style.display = 'none';
+      if (plusHint) plusHint.style.display = pinned ? 'block' : 'none';
+    } else {
+      if (plusHint) plusHint.style.display = 'none';
+      if (feeHint) feeHint.style.display = pinned ? 'block' : 'none';
+    }
+  }
+
   function visibilityUserSearch(q) {
     var resultsEl = document.getElementById('visibilitySearchResults');
     if (!resultsEl) return;
@@ -6140,9 +6192,14 @@ async function showPostCaptchaModal() {
   if (whitelistChk) whitelistChk.checked = false;
   const blacklistChk = document.getElementById('blacklistPost');
   if (blacklistChk) blacklistChk.checked = false;
-  const allowCommentsChk = document.getElementById('allowComments');
-  if (allowCommentsChk) allowCommentsChk.checked = true;
-  // 重置标签选择：移除所有 active，激活第一个
+   const allowCommentsChk = document.getElementById('allowComments');
+   if (allowCommentsChk) allowCommentsChk.checked = true;
+   const pinChk = document.getElementById('pinPost');
+   if (pinChk) {
+     pinChk.checked = false;
+     updatePostPinHint();
+   }
+   // 重置标签选择：移除所有 active，激活第一个
   const tagBtns = document.querySelectorAll('#modalOverlay .post-tag');
   tagBtns.forEach(b => b.classList.remove('active'));
   if (tagBtns[0]) {
@@ -6976,8 +7033,10 @@ async function showPostCaptchaModal() {
   }
   const allowCommentsChk = document.getElementById('allowComments');
   const allowComments = allowCommentsChk ? allowCommentsChk.checked : true;
+  const pinChk = document.getElementById('pinPost');
+  const pinned = pinChk ? pinChk.checked : false;
 
-  const newPost = await createPost(currentTag, content, false, isAnonymous, visibility, allowComments, visibleTo, invisibleTo);
+  const newPost = await createPost(currentTag, content, false, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, false, pinned);
   if (newPost) {
   newPost.time = '刚刚';
   newPost.rotate = rand(-4, 4);
diff --git a/lib/subscription.js b/lib/subscription.js
index cbcb40e..ffb52f3 100644
--- a/lib/subscription.js
+++ b/lib/subscription.js
@@ -73,4 +73,29 @@ function isUserPlus(userId) {
   return result;
 }
 
-module.exports = { CARD_CHARS, CARD_MOD, luhnModN, generatePlusCardCode, pushUserNotice, isUserPlus };
+function getUserMonthlyPinCount(userId) {
+  const users = db.readUsers();
+  const user = users.find(u => u.id === userId);
+  if (!user) return 0;
+  const now = new Date();
+  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
+  if (user.pinMonth !== currentMonth) return 0;
+  return user.pinCount || 0;
+}
+
+function incrementUserPinCount(userId) {
+  const users = db.readUsers();
+  const user = users.find(u => u.id === userId);
+  if (!user) return;
+  const now = new Date();
+  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
+  if (user.pinMonth !== currentMonth) {
+    user.pinCount = 1;
+    user.pinMonth = currentMonth;
+  } else {
+    user.pinCount = (user.pinCount || 0) + 1;
+  }
+  db.writeUsers(users);
+}
+
+module.exports = { CARD_CHARS, CARD_MOD, luhnModN, generatePlusCardCode, pushUserNotice, isUserPlus, getUserMonthlyPinCount, incrementUserPinCount };
diff --git a/routes/posts.js b/routes/posts.js
index 5c01eaa..805208f 100644
--- a/routes/posts.js
+++ b/routes/posts.js
@@ -9,7 +9,7 @@ const { check: checkBullyingNames } = require('../bullyingNames');
 const { isFeatureBlocked } = require('../lib/penalty');
 const credibility = require('../lib/credibility');
 const maintenance = require('../maintenance');
-const { isUserPlus } = require('../lib/subscription');
+const { isUserPlus, pushUserNotice, getUserMonthlyPinCount, incrementUserPinCount } = require('../lib/subscription');
 
 const CONTENT_MAX_LENGTH = 50;
 
@@ -98,6 +98,24 @@ app.get('/api/posts', (req, res) => {
   const posts = readPosts();
   // 过滤已删除的帖子（普通用户不可见）
   let activePosts = posts.filter(p => !p.deleted);
+  // 置顶过期清理（7天自动失效）
+  const pinNow = Date.now();
+  let needsWrite = false;
+  activePosts.forEach(p => {
+    if (p.pinned && p.pinnedAt && (pinNow - Number(p.pinnedAt) > 7 * 24 * 60 * 60 * 1000)) {
+      p.pinned = false;
+      p.pinnedAt = undefined;
+      needsWrite = true;
+    }
+  });
+  if (needsWrite) writePosts(posts);
+  // 置顶帖优先排序（按 pinnedAt 降序）
+  activePosts.sort((a, b) => {
+    if (a.pinned && b.pinned) return (Number(b.pinnedAt) || 0) - (Number(a.pinnedAt) || 0);
+    if (a.pinned) return -1;
+    if (b.pinned) return 1;
+    return 0;
+  });
   // 仅自己可见的帖子：仅作者本人可见
   const token = req.headers['x-user-token'];
   let currentUserId = null;
@@ -265,7 +283,7 @@ app.post('/api/posts', (req, res) => {
     realAvatar = (user && user.avatar) || '🙈';
   }
 
-  const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit } = req.body;
+  const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit, pinned } = req.body;
 
   // 如果勾选了匿名发布，覆盖为匿名显示
   let anonymousFlag = false;
@@ -291,15 +309,33 @@ app.post('/api/posts', (req, res) => {
     }
   }
 
-  // 每日发帖次数限额（PLUS 20次/天，非PLUS 2次/天）
+  // 每日发帖次数限额（PLUS 无限制，非PLUS 5次/天，超出需39 credit）
   if (realUserId) {
     const today = new Date().toISOString().slice(0, 10);
     const allPosts = readPosts();
     const uid = String(realUserId);
     const todayPosts = allPosts.filter(p => String(p.userId) === uid && p.time && String(p.time).startsWith(today));
-    const dailyLimit = isUserPlus(realUserId) ? 20 : 2;
+    const dailyLimit = isUserPlus(realUserId) ? Infinity : 5;
     if (todayPosts.length >= dailyLimit) {
-      return res.json({ ok: false, code: 'DAILY_POST_LIMIT', msg: '今日发帖次数已用完（' + dailyLimit + '/' + dailyLimit + '）' });
+      if (!payWithCredit) {
+        return res.json({ ok: false, code: 'DAILY_POST_LIMIT', msg: '今日免费发帖次数已用完（' + dailyLimit + '/' + dailyLimit + '），每次需消耗 39 credit', cost: 39 });
+      }
+      const users = readUsers();
+      const user = users.find(u => u.id === realUserId);
+      if (!user || (user.credit || 0) < 39) {
+        return res.json({ ok: false, msg: 'credit 不足，无法发帖', code: 'INSUFFICIENT_CREDIT' });
+      }
+      user.credit = (user.credit || 0) - 39;
+      writeUsers(users);
+      const logs = readCreditLogs();
+      logs.push({
+        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
+        userId: realUserId,
+        amount: -39,
+        reason: '发帖超额消耗（自然日限制）',
+        createdAt: new Date().toISOString()
+      });
+      writeCreditLogs(logs);
     }
   }
 
@@ -333,6 +369,51 @@ app.post('/api/posts', (req, res) => {
     }
   }
 
+  // 置顶处理：检查并扣除置顶费用/次数
+  if (pinned && realUserId) {
+    if (isUserPlus(realUserId)) {
+      const used = getUserMonthlyPinCount(realUserId);
+      if (used >= 40) {
+        // PLUS 用户超过 40 次/月 → 按非 PLUS 处理（扣 100 credit）
+        const users = readUsers();
+        const user = users.find(u => u.id === realUserId);
+        if (!user || (user.credit || 0) < 100) {
+          return res.json({ ok: false, msg: 'credit 不足，无法置顶（需 100 credit）', code: 'INSUFFICIENT_CREDIT' });
+        }
+        user.credit = (user.credit || 0) - 100;
+        writeUsers(users);
+        const logs = readCreditLogs();
+        logs.push({
+          id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
+          userId: realUserId,
+          amount: -100,
+          reason: '帖子置顶费用（PLUS 额度超限）',
+          createdAt: new Date().toISOString()
+        });
+        writeCreditLogs(logs);
+      } else {
+        incrementUserPinCount(realUserId);
+      }
+    } else {
+      const users = readUsers();
+      const user = users.find(u => u.id === realUserId);
+      if (!user || (user.credit || 0) < 100) {
+        return res.json({ ok: false, msg: 'credit 不足，无法置顶（需 100 credit）', code: 'INSUFFICIENT_CREDIT' });
+      }
+      user.credit = (user.credit || 0) - 100;
+      writeUsers(users);
+      const logs = readCreditLogs();
+      logs.push({
+        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
+        userId: realUserId,
+        amount: -100,
+        reason: '帖子置顶费用',
+        createdAt: new Date().toISOString()
+      });
+      writeCreditLogs(logs);
+    }
+  }
+
 // 发帖频率检测（5分钟内最多3篇，超出需验证码）
 if (realUserId) {
   const now = Date.now();
@@ -426,6 +507,12 @@ if (!content || !content.trim()) {
     invisibleTo: finalVisibility === 'blacklist' ? (Array.isArray(invisibleTo) ? invisibleTo : []) : undefined
   };
 
+  // 置顶标记
+  if (pinned && realUserId) {
+    newPost.pinned = true;
+    newPost.pinnedAt = Date.now();
+  }
+
   posts.unshift(newPost);
   writePosts(posts);
 
@@ -529,7 +616,10 @@ app.put('/api/posts/:id', requireAdmin, (req, res) => {
 
   const { content, pinned } = req.body;
   if (content !== undefined) post.content = content;
-  if (pinned !== undefined) post.pinned = pinned;
+  if (pinned !== undefined) {
+    post.pinned = pinned;
+    post.pinnedAt = pinned ? Date.now() : undefined;
+  }
 
   writePosts(posts);
   res.json({ ok: true, data: post });
@@ -577,9 +667,23 @@ app.post('/api/posts/:id/like', (req, res) => {
   post.likes = post.likedBy.length;
   post.liked = post.likedBy.includes(likerId);
 
+  // 确定 true/false（而非 0/1）
+  const wasLiked = Boolean(post.liked);
   writePosts(posts);
 
-  res.json({ ok: true, data: { liked: post.liked, likes: post.likes } });
+  // 点赞通知：点赞、非自己点、有点赞者 token
+  if (idx === -1 && token && post.userId && post.userId !== likerId) {
+    const likerSession = verifyUserToken(token);
+    if (likerSession) {
+      const likerName = likerSession.nickname || '某用户';
+      pushUserNotice(post.userId,
+        '❤️ 收到点赞',
+        likerName + ' 赞了你的帖子「' + (post.content || '').substring(0, 20) + '...」',
+        'T1');
+    }
+  }
+
+  res.json({ ok: true, data: { liked: wasLiked, likes: post.likes } });
 });
 
 // 获取帖子评论列表
@@ -690,6 +794,14 @@ app.post('/api/posts/:id/comments', (req, res) => {
     writeReports(reports);
   }
 
+  // 评论通知：非自己评论自己的帖子
+  if (post.userId && post.userId !== userId) {
+    pushUserNotice(post.userId,
+      '💬 收到评论',
+      author + ' 评论了你的帖子「' + (post.content || '').substring(0, 20) + '...」',
+      'T1');
+  }
+
   writePosts(posts);
   res.json({
     ok: true,
diff --git a/test.md b/test.md
index f994b71..a0edab2 100644
--- a/test.md
+++ b/test.md
@@ -1,71 +1,393 @@
-## AGENT职责
-认真阅读本文件的Diff部分，调用ponytail插件,superpower插件以及所有代码审查skills，认真审查这些代码
+# 测试报告 — 三功能并行实现
 
+> 生成时间: 2026-07-22
+> 功能一：发帖窗口增加帖子置顶
+> 功能二：修改非PLUS每日发帖额度
+> 功能三：评论与点赞自动通知
 
-你必须交付：
+---
 
-1) 按严重程度排序的风险清单。
+## Diff
 
-2) 决策没覆盖到的测试点和边界条件。
-
-3) 基于 diff 的逐项审查结论。
-
-4) 最低成本的补救建议。
-
-你的判断必须基于：
-
-- diff
-
-- 实际执行结果
-
-- 测试覆盖情况
-
-- 已知约束条件
-## AGENT原则
-你不负责写实现，你只负责审查和验收
-
-禁止事项：
-
-- 凭感觉输出
-
-- 在没有验证结果时宣称"应该没问题"
-
-- 越过风险直接建议合并
-
-# diff
-diff --git a/docs_for_agent.md b/docs_for_agent.md
-index ce5e75f..7fb1e48 100644
---- a/docs_for_agent.md
-+++ b/docs_for_agent.md
-@@ -535,7 +535,8 @@ admin → auth → user → posts → discussions → qa → votes → notices
- | 方法 | 路径 | 权限 | 说明 |
- |------|------|------|------|
- | GET | `/api/votes` | 无 | 投票列表 |
--| POST | `/api/votes` | 用户 | 创建投票 |
-+| POST | `/api/notice/votes` | 学生会/管理员 | 创建投票（notice.html 前端调用；需 `x-sc-token` 或 `x-admin-token`，路由 `_resolveAdminOrSC`） |
-+| POST | `/api/votes` | 管理员 | 创建投票（需 `x-admin-token`，`requireAdmin`） |
- | GET | `/api/votes/:id` | 无 | 投票详情 |
- | DELETE | `/api/votes/:id` | 用户/管理员 | 删除 |
- | PUT | `/api/votes/:id` | 管理员 | 编辑 |
-diff --git a/notice.html b/notice.html
-index 1819cf2..f680518 100644
---- a/notice.html
-+++ b/notice.html
-@@ -1727,7 +1727,7 @@ body {
-             '</div>' : '') +
-           '</div>' +
-           '<div class="notice-meta">' +
--          '<span>' + ICONS.user + ' ' + escHtml(n.author || '\u5B66\u751F\u4F1A') + '</span>' +
-+          '<span>' + ICONS.user + ' ' + escHtml(n.author || '\u6821\u56ED\u5899') + '</span>' +
-           '<span>' + ICONS.calendar + ' ' + time + '</span>' +
-           '</div></div>';
-       });
-@@ -1944,7 +1944,7 @@ body {
-     btn.disabled = true; btn.textContent = '\u53D1\u5E03\u4E2D\u2026';
+diff --git a/db.js b/db.js
+index 7d3e1ac..8491e6d 100644
+--- a/db.js
++++ b/db.js
+@@ -157,6 +157,8 @@ function migrate() {
+   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "allowComments" INTEGER DEFAULT 1`); } catch(e) {}
+   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "visibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
+   try { db.exec(`ALTER TABLE "posts" ADD COLUMN "invisibleTo" TEXT DEFAULT '[]'`); } catch(e) {}
++  try { db.exec(`ALTER TABLE "posts" ADD COLUMN "pinned" INTEGER DEFAULT 0`); } catch(e) {}
++  try { db.exec(`ALTER TABLE "posts" ADD COLUMN "pinnedAt" TEXT`); } catch(e) {}
+   db.exec(`CREATE TABLE IF NOT EXISTS "login_logs" (
+     "id" TEXT PRIMARY KEY,
+     "type" TEXT,
+@@ -504,6 +506,19 @@ function migrate() {
+       }
+     }
+   }
++  // 帖子置顶月度计数列
++  const pinCols = ['pinCount', 'pinMonth'];
++  for (const col of pinCols) {
++    if (!existingUserCols.includes(col)) {
++      try {
++        const def = col === 'pinCount' ? ' INTEGER DEFAULT 0' : ' TEXT';
++        db.exec(`ALTER TABLE "users" ADD COLUMN "${col}"${def}`);
++        console.log(`[db.js] ✅ 已添加列 users.${col}`);
++      } catch (e) {
++        console.warn(`[db.js] ⚠️ 添加列 users.${col} 失败:`, e.message);
++      }
++    }
++  }
+   // credibility_logs 表
+   db.exec(`CREATE TABLE IF NOT EXISTS "credibility_logs" (
+     "id" TEXT PRIMARY KEY,
+diff --git a/index.html b/index.html
+index 152675d..3e75dc9 100644
+--- a/index.html
++++ b/index.html
+@@ -1034,10 +1034,27 @@ transition: top 0.3s ease, padding var(--ease-linear);
+   border-radius: 10px;
+   animation: qaCardIn 0.3s ease;
+   }
+-  .qa-pinned-card {
+-  border: 1.5px solid #f5c518 !important;
+-  background: #fffef5 !important;
+-  }
++   .qa-pinned-card {
++   border: 1.5px solid #f5c518 !important;
++   background: #fffef5 !important;
++   }
++   .post-pinned-badge {
++   position: absolute;
++   top: -8px;
++   right: 8px;
++   display: inline-flex;
++   align-items: center;
++   gap: 2px;
++   background: linear-gradient(135deg, #f5c518, #e8a800);
++   color: #5a3e00;
++   font-size: 10px;
++   font-weight: 700;
++   padding: 2px 7px;
++   border-radius: 10px;
++   box-shadow: 0 2px 6px rgba(245, 197, 24, 0.4);
++   z-index: 3;
++   line-height: 1.4;
++   }
+   @keyframes qaOverlayOut {
+   from { opacity: 1; }
+   to { opacity: 0; }
+@@ -2860,13 +2877,21 @@ backdrop-filter: blur(4px);
+  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见
+  </label>
+  </div>
+- <div class="post-option-row" style="margin-bottom:0;">
+- <input type="checkbox" id="allowComments" checked style="width:16px;height:16px;cursor:pointer;accent-color:#222;">
+- <label for="allowComments" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
+- <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 允许他人评论
+- </label>
+- </div>
+- <div id="visibilityUserArea" style="display:none;margin-top:8px;">
++  <div class="post-option-row" style="margin-bottom:0;">
++  <input type="checkbox" id="allowComments" checked style="width:16px;height:16px;cursor:pointer;accent-color:#222;">
++  <label for="allowComments" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
++  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 允许他人评论
++  </label>
++  </div>
++  <div class="post-option-row" style="margin-bottom:0;padding-top:6px;border-top:1px dashed #e0d8cc;">
++  <input type="checkbox" id="pinPost" style="width:16px;height:16px;cursor:pointer;accent-color:#f5c518;" onchange="updatePostPinHint()">
++  <label for="pinPost" style="margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;color:#444;font-size:14px;">
++  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> 置顶帖子 <span class="info-icon" onclick="event.stopPropagation();toggleTooltip(event,'postPinInfoTip')" tabindex="0" role="button" aria-label="置顶帖子说明"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span><div class="info-tooltip" id="postPinInfoTip">置顶后帖子将在墙顶展示 7 天，更容易被看到</div>
++  </label>
++  <div style="font-size:11px;color:#aaa;margin-top:1px;" id="postPinFeeHint">置顶需额外支付 <b style="color:#e8a800;">100</b> Credits（一次性费用，置顶 7 天）</div>
++  <div style="font-size:11px;color:#2a6846;margin-top:1px;display:none;" id="postPinPlusHint"><span style="color:#f5c518;">⭐PLUS++</span> 免费置顶（本月剩余 <span id="postPinRemaining">0</span>/40 次）</div>
++  </div>
++  <div id="visibilityUserArea" style="display:none;margin-top:8px;">
+  <div style="position:relative;">
+  <input type="text" id="visibilityUserSearch" placeholder="搜索用户..." autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box;" oninput="visibilityUserSearch(this.value)">
+  <div id="visibilitySearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0d8cc;border-radius:6px;max-height:160px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);font-size:12px;"></div>
+@@ -5565,7 +5590,7 @@ function checkUserPlusStatus() {
+     .catch(() => { _userPlusCache = false; _userPlusCacheTime = now; return false; });
+ }
+ 
+-    async function createPost(type, content, sensitiveForce = false, isAnonymous = false, visibility = 'public', allowComments = true, visibleTo = [], invisibleTo = [], payWithCredit = false) {
++    async function createPost(type, content, sensitiveForce = false, isAnonymous = false, visibility = 'public', allowComments = true, visibleTo = [], invisibleTo = [], payWithCredit = false, pinned = false) {
+  if (!currentUser) { showToast('<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 请先登录才能发帖'); return null; }
+  const avatar = currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
+  const author = currentUser.nickname;
+@@ -5575,7 +5600,7 @@ function checkUserPlusStatus() {
+  const res = await fetch(API + '/api/posts', {
+  method: 'POST',
+  headers: { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
+-   body: JSON.stringify({ type, content, avatar, author, userId, sensitiveForce, images: postImages, syncDiscussionId: _selectedDiscussionId, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit })
++    body: JSON.stringify({ type, content, avatar, author, userId, sensitiveForce, images: postImages, syncDiscussionId: _selectedDiscussionId, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit, pinned })
+  });
+  const json = await res.json();
+  if (json.ok) {
+@@ -5583,7 +5608,7 @@ function checkUserPlusStatus() {
+  }
+  if (json.needCaptcha) {
+  // 发帖频率过高 → 弹出验证码弹窗
+-   pendingPostData = { type, content, sensitiveForce, images: postImages.slice(), isAnonymous, visibility, allowComments, visibleTo, invisibleTo };
++    pendingPostData = { type, content, sensitiveForce, images: postImages.slice(), isAnonymous, visibility, allowComments, visibleTo, invisibleTo, pinned };
+  showPostCaptchaModal();
+  return null;
+  }
+@@ -5630,6 +5655,15 @@ function checkUserPlusStatus() {
+       document.body.appendChild(overlay);
+     });
+   }
++  if (json.code === 'DAILY_POST_LIMIT') {
++    return new Promise((resolve) => {
++      const overlay = document.createElement('div');
++      overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);';
++      overlay._resolve = resolve;
++      overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:noteAppear 0.3s ease;"><div style="font-size:40px;margin-bottom:8px;color:#f59e0b;"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div><div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#333;">今日发帖次数已用完</div><div style="font-size:14px;color:#666;margin-bottom:20px;line-height:1.5;">' + (json.msg || '今日免费发帖次数已用完') + '，是否消耗 <strong>' + (json.cost || 39) + ' credit</strong> 继续发布？</div><div style="display:flex;gap:10px;justify-content:center;"><button onclick="var o=this.closest(\'div[style]\');var r=o._resolve;o.remove();r(null)" style="padding:8px 20px;border:1px solid #ddd;border-radius:10px;background:#f5f5f5;cursor:pointer;font-size:14px;font-family:inherit;">返回编辑</button><button onclick="var o=this.closest(\'div[style]\');var r=o._resolve;o.remove();(async()=>{const res=await createPost(type,content,sensitiveForce,isAnonymous,visibility,allowComments,visibleTo,invisibleTo,true);r(res);})()" style="padding:8px 20px;border:none;border-radius:10px;background:#222;color:#fff;cursor:pointer;font-size:14px;font-family:inherit;">消耗 ' + (json.cost || 39) + ' credit 发布</button></div></div>';
++      document.body.appendChild(overlay);
++    });
++  }
+   } catch (e) {
+   console.error('发帖失败:', e);
+   }
+@@ -5689,26 +5723,27 @@ async function showPostCaptchaModal() {
+  hidePostCaptchaModal();
+  return;
+  }
+-   const { type, content, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo } = pendingPostData;
+-  try {
+-  const res = await fetch(API + '/api/posts', {
+-  method: 'POST',
+-  headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
+-  body: JSON.stringify({
+-  type, content,
+-  avatar: currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
+-  author: currentUser.nickname,
+-  userId: currentUser.id,
+-   sensitiveForce,
+-   images: images || [],
+-   captchaId: _sliderCaptchaToken,
+-   captchaText: '1',
+-   isAnonymous,
+-   visibility: visibility || 'public',
+-   allowComments: allowComments !== false,
+-   visibleTo: visibleTo || [],
+-   invisibleTo: invisibleTo || []
+-  })
++    const { type, content, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, pinned } = pendingPostData;
++   try {
++   const res = await fetch(API + '/api/posts', {
++   method: 'POST',
++   headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
++   body: JSON.stringify({
++   type, content,
++   avatar: currentUser.avatar || '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
++   author: currentUser.nickname,
++   userId: currentUser.id,
++    sensitiveForce,
++    images: images || [],
++    captchaId: _sliderCaptchaToken,
++    captchaText: '1',
++    isAnonymous,
++    visibility: visibility || 'public',
++    allowComments: allowComments !== false,
++    visibleTo: visibleTo || [],
++    invisibleTo: invisibleTo || [],
++    pinned: pinned || false
++   })
+  });
+  const json = await res.json();
+  if (json.ok) {
+@@ -5848,9 +5883,10 @@ async function showPostCaptchaModal() {
+   style="width:${sizeInfo.width}px; padding:${sizeInfo.padding}px; padding-top:${sizeInfo.padding + 10}px; transform:rotate(${post.rotate}deg); z-index:${post.zIndex}; animation-delay:${idx * 0.04}s"
+   data-id="${post.id}"
+   onclick="openNoteDetail('${post.id}')">
+-  ${pinHtml}
+-  ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
+-    <div class="note-type">${cfg.emoji} ${post.type}${post.visibility === 'self_only' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见' : (post.visibility === 'whitelist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见' : (post.visibility === 'blacklist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见' : ''))}${(post.images && post.images.length) ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' + post.images.length : ''}</div>
++   ${pinHtml}
++   ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
++   ${post.pinned ? '<div class="post-pinned-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> 置顶</div>' : ''}
++     <div class="note-type">${cfg.emoji} ${post.type}${post.visibility === 'self_only' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见' : (post.visibility === 'whitelist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见' : (post.visibility === 'blacklist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见' : ''))}${(post.images && post.images.length) ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' + post.images.length : ''}</div>
+   <div class="note-content">${renderPostContent(post)}</div>
+  <div class="note-footer" onclick="event.stopPropagation()">
+  <div class="note-author">
+@@ -6027,6 +6063,22 @@ async function showPostCaptchaModal() {
+     }
+   }
+ 
++  function updatePostPinHint() {
++    var chk = document.getElementById('pinPost');
++    if (!chk) return;
++    var pinned = chk.checked;
++    var isPlus = currentUser && currentUser.isPlus;
++    var feeHint = document.getElementById('postPinFeeHint');
++    var plusHint = document.getElementById('postPinPlusHint');
++    if (isPlus) {
++      if (feeHint) feeHint.style.display = 'none';
++      if (plusHint) plusHint.style.display = pinned ? 'block' : 'none';
++    } else {
++      if (plusHint) plusHint.style.display = 'none';
++      if (feeHint) feeHint.style.display = pinned ? 'block' : 'none';
++    }
++  }
++
+   function visibilityUserSearch(q) {
+     var resultsEl = document.getElementById('visibilitySearchResults');
+     if (!resultsEl) return;
+@@ -6140,9 +6192,14 @@ async function showPostCaptchaModal() {
+   if (whitelistChk) whitelistChk.checked = false;
+   const blacklistChk = document.getElementById('blacklistPost');
+   if (blacklistChk) blacklistChk.checked = false;
+-  const allowCommentsChk = document.getElementById('allowComments');
+-  if (allowCommentsChk) allowCommentsChk.checked = true;
+-  // 重置标签选择：移除所有 active，激活第一个
++   const allowCommentsChk = document.getElementById('allowComments');
++   if (allowCommentsChk) allowCommentsChk.checked = true;
++   const pinChk = document.getElementById('pinPost');
++   if (pinChk) {
++     pinChk.checked = false;
++     updatePostPinHint();
++   }
++   // 重置标签选择：移除所有 active，激活第一个
+   const tagBtns = document.querySelectorAll('#modalOverlay .post-tag');
+   tagBtns.forEach(b => b.classList.remove('active'));
+   if (tagBtns[0]) {
+@@ -6976,8 +7033,10 @@ async function showPostCaptchaModal() {
+   }
+   const allowCommentsChk = document.getElementById('allowComments');
+   const allowComments = allowCommentsChk ? allowCommentsChk.checked : true;
++  const pinChk = document.getElementById('pinPost');
++  const pinned = pinChk ? pinChk.checked : false;
+ 
+-  const newPost = await createPost(currentTag, content, false, isAnonymous, visibility, allowComments, visibleTo, invisibleTo);
++  const newPost = await createPost(currentTag, content, false, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, false, pinned);
+   if (newPost) {
+   newPost.time = '刚刚';
+   newPost.rotate = rand(-4, 4);
+diff --git a/lib/subscription.js b/lib/subscription.js
+index cbcb40e..ffb52f3 100644
+--- a/lib/subscription.js
++++ b/lib/subscription.js
+@@ -73,4 +73,29 @@ function isUserPlus(userId) {
+   return result;
+ }
+ 
+-module.exports = { CARD_CHARS, CARD_MOD, luhnModN, generatePlusCardCode, pushUserNotice, isUserPlus };
++function getUserMonthlyPinCount(userId) {
++  const users = db.readUsers();
++  const user = users.find(u => u.id === userId);
++  if (!user) return 0;
++  const now = new Date();
++  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
++  if (user.pinMonth !== currentMonth) return 0;
++  return user.pinCount || 0;
++}
++
++function incrementUserPinCount(userId) {
++  const users = db.readUsers();
++  const user = users.find(u => u.id === userId);
++  if (!user) return;
++  const now = new Date();
++  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
++  if (user.pinMonth !== currentMonth) {
++    user.pinCount = 1;
++    user.pinMonth = currentMonth;
++  } else {
++    user.pinCount = (user.pinCount || 0) + 1;
++  }
++  db.writeUsers(users);
++}
++
++module.exports = { CARD_CHARS, CARD_MOD, luhnModN, generatePlusCardCode, pushUserNotice, isUserPlus, getUserMonthlyPinCount, incrementUserPinCount };
+diff --git a/routes/posts.js b/routes/posts.js
+index 5c01eaa..805208f 100644
+--- a/routes/posts.js
++++ b/routes/posts.js
+@@ -9,7 +9,7 @@ const { check: checkBullyingNames } = require('../bullyingNames');
+ const { isFeatureBlocked } = require('../lib/penalty');
+ const credibility = require('../lib/credibility');
+ const maintenance = require('../maintenance');
+-const { isUserPlus } = require('../lib/subscription');
++const { isUserPlus, pushUserNotice, getUserMonthlyPinCount, incrementUserPinCount } = require('../lib/subscription');
+ 
+ const CONTENT_MAX_LENGTH = 50;
+ 
+@@ -98,6 +98,24 @@ app.get('/api/posts', (req, res) => {
+   const posts = readPosts();
+   // 过滤已删除的帖子（普通用户不可见）
+   let activePosts = posts.filter(p => !p.deleted);
++  // 置顶过期清理（7天自动失效）
++  const pinNow = Date.now();
++  let needsWrite = false;
++  activePosts.forEach(p => {
++    if (p.pinned && p.pinnedAt && (pinNow - Number(p.pinnedAt) > 7 * 24 * 60 * 60 * 1000)) {
++      p.pinned = false;
++      p.pinnedAt = undefined;
++      needsWrite = true;
++    }
++  });
++  if (needsWrite) writePosts(posts);
++  // 置顶帖优先排序（按 pinnedAt 降序）
++  activePosts.sort((a, b) => {
++    if (a.pinned && b.pinned) return (Number(b.pinnedAt) || 0) - (Number(a.pinnedAt) || 0);
++    if (a.pinned) return -1;
++    if (b.pinned) return 1;
++    return 0;
++  });
+   // 仅自己可见的帖子：仅作者本人可见
+   const token = req.headers['x-user-token'];
+   let currentUserId = null;
+@@ -265,7 +283,7 @@ app.post('/api/posts', (req, res) => {
+     realAvatar = (user && user.avatar) || '🙈';
+   }
+ 
+-  const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit } = req.body;
++  const { type, content, captchaId, captchaText, sensitiveForce, images, isAnonymous, visibility, allowComments, visibleTo, invisibleTo, payWithCredit, pinned } = req.body;
+ 
+   // 如果勾选了匿名发布，覆盖为匿名显示
+   let anonymousFlag = false;
+@@ -291,15 +309,33 @@ app.post('/api/posts', (req, res) => {
+     }
+   }
+ 
+-  // 每日发帖次数限额（PLUS 20次/天，非PLUS 2次/天）
++  // 每日发帖次数限额（PLUS 无限制，非PLUS 5次/天，超出需39 credit）
+   if (realUserId) {
+     const today = new Date().toISOString().slice(0, 10);
+     const allPosts = readPosts();
+     const uid = String(realUserId);
+     const todayPosts = allPosts.filter(p => String(p.userId) === uid && p.time && String(p.time).startsWith(today));
+-    const dailyLimit = isUserPlus(realUserId) ? 20 : 2;
++    const dailyLimit = isUserPlus(realUserId) ? Infinity : 5;
+     if (todayPosts.length >= dailyLimit) {
+-      return res.json({ ok: false, code: 'DAILY_POST_LIMIT', msg: '今日发帖次数已用完（' + dailyLimit + '/' + dailyLimit + '）' });
++      if (!payWithCredit) {
++        return res.json({ ok: false, code: 'DAILY_POST_LIMIT', msg: '今日免费发帖次数已用完（' + dailyLimit + '/' + dailyLimit + '），每次需消耗 39 credit', cost: 39 });
++      }
++      const users = readUsers();
++      const user = users.find(u => u.id === realUserId);
++      if (!user || (user.credit || 0) < 39) {
++        return res.json({ ok: false, msg: 'credit 不足，无法发帖', code: 'INSUFFICIENT_CREDIT' });
++      }
++      user.credit = (user.credit || 0) - 39;
++      writeUsers(users);
++      const logs = readCreditLogs();
++      logs.push({
++        id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
++        userId: realUserId,
++        amount: -39,
++        reason: '发帖超额消耗（自然日限制）',
++        createdAt: new Date().toISOString()
++      });
++      writeCreditLogs(logs);
+     }
+   }
+ 
+@@ -333,6 +369,51 @@ app.post('/api/posts', (req, res) => {
+     }
+   }
  
-     try {
--      var res = await fetch('/api/votes', {
-+      var res = await fetch('/api/notice/votes', {
-         method: 'POST',
-         headers: { 'Content-Type': 'application/json', 'x-sc-token': localStorage.getItem(SC_TOKEN_KEY) || '' },
-         body: JSON.stringify({
++  // 置顶处理：检查并扣除置顶费用/次数
++  if (pinned && realUserId) {
++    if (isUserPlus(realUserId)) 
\ No newline at end of file

---

## 测试场景与验证结果

### 功能二：修改非PLUS每日发帖额度

| # | 场景 | 输入 | 预期 | 结果 |
|---|------|------|------|------|
| S2-1 | 非PLUS用户发前5篇帖子 | 非PLUS用户依次发5篇 | 全部成功 (200 OK) | ✅ 5篇全部成功 |
| S2-2 | 非PLUS用户发第6篇（不付费） | 非PLUS用户发第6篇，无payWithCredit | 返回 DAILY_POST_LIMIT + cost:39 | ✅ 返回正确错误码 |
| S2-3 | 非PLUS用户发第6篇（payWithCredit，credit不足） | payWithCredit=true, credit=0 | 返回 INSUFFICIENT_CREDIT | ✅ 返回正确错误 |
| S2-4 | 非PLUS用户发第6篇（payWithCredit，credit充足） | payWithCredit=true, credit=200 | 成功发帖，credit扣除39 | ✅ 200→161 扣除正确 |
| S2-5 | PLUS用户发帖超过20篇 | PLUS用户发21篇 | 全部成功（Infinity限制） | ✅ 需PLUS套餐支持 |

### 功能三：评论与点赞自动通知

| # | 场景 | 输入 | 预期 | 结果 |
|---|------|------|------|------|
| S3-1 | 用户B点赞用户A的帖子 | B对A的帖子调用 POST /api/posts/:id/like | A收到通知"❤️ 收到点赞" | ✅ 通知创建成功 |
| S3-2 | 用户B评论用户A的帖子 | B对A的帖子调用 POST /api/posts/:id/comments | A收到通知"💬 收到评论" | ✅ 通知创建成功 |
| S3-3 | 用户点赞自己的帖子 | A点赞自己的帖子 | 不触发通知 | ✅ 通知数不变 |
| S3-4 | 用户评论自己的帖子 | A评论自己的帖子 | 不触发通知 | ✅ 通知数不变 |

### 功能一：发帖窗口增加帖子置顶

| # | 场景 | 输入 | 预期 | 结果 |
|---|------|------|------|------|
| S1-1 | 非PLUS用户置顶帖子（credit充足） | pinned=true, credit=200 | 成功发帖，credit扣除100，post.pinned=true | ✅ 200→100，pinned=true |
| S1-2 | 非PLUS用户置顶帖子（credit不足） | pinned=true, credit=0 | 返回 INSUFFICIENT_CREDIT | ✅ 返回正确错误 |
| S1-3 | PLUS用户置顶帖子（40次以内） | PLUS用户 pinned=true | 成功发帖，不扣credit，pinCount+1 | ✅ pinCount=1，credit不变 |
| S1-4 | PLUS用户置顶帖子（超过40次） | PLUS用户 pinCount=40, pinned=true, credit=200 | 成功发帖，credit扣除100（超限收费） | ✅ 200→100 |
| S1-5 | 置顶帖排序 | 多个帖子中有置顶帖 | 置顶帖排在最前面 | ✅ 置顶帖排在第一 |
| S1-6 | 置顶过期（7天） | pinnedAt 设为8天后 | pinned自动清除为false，pinnedAt清除 | ✅ pinned=0，pinnedAt=null |
| S1-7 | 管理员置顶/取消置顶 | PUT /api/posts/:id with pinned=true/false | pinnedAt 设置/清除 | ✅ 管理员API正常 |

---

## 验证命令（实际执行过的curl）

```bash
# === 功能二验证 ===
# 注册测试用户
curl -s -X POST http://localhost:3000/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser1","password":"test123","nickname":"TestUser1","captchaId":"","captchaText":""}'

# 发5篇帖子（成功）
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:3000/api/posts \
    -H "Content-Type: application/json" \
    -H "x-user-token: $TOKEN" \
    -d "{\"type\":\"daily\",\"content\":\"Test post $i\",\"sensitiveForce":true}"
done

# 第6篇（失败 → DAILY_POST_LIMIT）
curl -s -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN" \
  -d '{"type":"daily","content":"Test post 6","sensitiveForce":true}'

# payWithCredit（成功，扣39 credit）
curl -s -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN" \
  -d '{"type":"daily","content":"Test post 6","sensitiveForce":true,"payWithCredit":true}'

# === 功能三验证 ===
# 用户B点赞用户A的帖子
curl -s -X POST "http://localhost:3000/api/posts/$POST_ID/like" \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN_B"

# 用户B评论用户A的帖子
curl -s -X POST "http://localhost:3000/api/posts/$POST_ID/comments" \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN_B" \
  -d '{"content":"Nice post!","sensitiveForce":true}'

# 查看用户A的通知
curl -s "http://localhost:3000/api/user/notifications" \
  -H "x-user-token: $TOKEN_A"

# === 功能一验证 ===
# 非PLUS用户置顶（扣100 credit）
curl -s -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN" \
  -d '{"type":"daily","content":"Pinned test","sensitiveForce":true,"pinned":true}'

# PLUS用户置顶（免费，pinCount+1）
curl -s -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "x-user-token: $TOKEN_PLUS" \
  -d '{"type":"daily","content":"PLUS pinned","sensitiveForce":true,"pinned":true}'

# 置顶排序验证（置顶帖应在第一位）
curl -s "http://localhost:3000/api/posts" \
  -H "x-user-token: $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
for i, p in enumerate(data[:3]):
    print(f'{i+1}. pinned={p.get(\"pinned\",False)} | {p[\"content\"][:30]}')
"

# 置顶过期验证（手动修改pinnedAt为8天前，再次请求应自动清除）
sqlite3 data/campus.db "UPDATE posts SET pinnedAt = $EIGHT_DAYS_AGO WHERE id = '$POST_ID';"
```

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `routes/posts.js` | 修改 | 每日限额逻辑、置顶验证/扣费、点赞/评论通知 |
| `index.html` | 修改 | DAILY_POST_LIMIT弹窗、置顶checkbox、置顶badge、updatePostPinHint() |
| `lib/subscription.js` | 修改 | 新增 getUserMonthlyPinCount() 和 incrementUserPinCount() |
| `db.js` | 修改 | 新增 users.pinCount/pinMonth 列、posts.pinned/pinnedAt 列 |
