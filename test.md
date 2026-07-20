## AGENT职责
认真阅读本文件的Diff部分，调用所有代码审查skills，认真审查这些代码


你必须交付：

1) 按严重程度排序的风险清单。

2) 决策没覆盖到的测试点和边界条件。

3) 基于 diff 的逐项审查结论。

4) 最低成本的补救建议。

你的判断必须基于：

- diff

- 实际执行结果

- 测试覆盖情况

- 已知约束条件
## AGENT原则
你不负责写实现，你只负责审查和验收

禁止事项：

- 凭感觉输出

- 在没有验证结果时宣称"应该没问题"

- 越过风险直接建议合并


# 目标
## 增加PLUS++帖子框的显眼度
原有的PLUS++帖子框在index.html中的帖子卡片上不够显眼，请你提供 方案给我选项向我提问让我来回答，帮助你解决此问题

## 优化Index.html帖子弹窗

index.html点击帖子卡片进入的弹窗中 ，将‘PLUS++ 认证’改为‘PLUS++’ 同时将旁边的同学认证标识‘已认证’删除，仅保留同学认证svg图标

## 修复：匿名发帖下可以通过点击发帖者的帖子卡片中的头像进入对方的用户主页
解决这个问题

# diff
diff --git a/css/plus.css b/css/plus.css
index 411becc..54391ac 100644
--- a/css/plus.css
+++ b/css/plus.css
@@ -1,14 +1,19 @@
 /* PLUS++ 会员样式 - 共享于 index.html 和 post.html */
-.plus-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:11px;font-weight:700;letter-spacing:0.05em;box-shadow:0 1px 4px rgba(245,158,11,0.4);}
+.plus-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:12px;font-weight:700;letter-spacing:0.05em;box-shadow:0 2px 8px rgba(245,158,11,0.5);}
 .plus-badge svg{flex-shrink:0;}
-.plus-gold{position:relative;border-color:#f59e0b !important;box-shadow:0 0 0 2px rgba(245,158,11,0.15),0 2px 8px rgba(245,158,11,0.1) !important;overflow:hidden;}
+.plus-gold{position:relative;border-color:#f59e0b !important;box-shadow:0 0 0 2px rgba(245,158,11,0.3),0 0 0 5px rgba(245,158,11,0.1),inset 0 1px 6px rgba(245,158,11,0.08),0 2px 12px rgba(245,158,11,0.15) !important;overflow:hidden;}
 .plus-gold::before{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.25),transparent);animation:shimmer 3s ease-in-out infinite;pointer-events:none;}
+.plus-gold::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b);pointer-events:none;}
 @keyframes shimmer{0%{left:-60%}50%{left:100%}100%{left:100%}}
 .plus-gold .note-type::after{content:' ⭐PLUS';color:#d97706;font-weight:700;}
 .plus-gold .note-footer .note-author .plus-badge{display:inline-flex;vertical-align:middle;margin-left:3px;font-size:10px;padding:1px 6px;}
-.note-detail-box.plus-gold{border:2px solid #f59e0b !important;box-shadow:0 0 0 3px rgba(245,158,11,0.12),0 4px 16px rgba(245,158,11,0.15) !important;}
+.note-detail-box.plus-gold{border:2px solid #f59e0b !important;box-shadow:0 0 0 3px rgba(245,158,11,0.25),0 0 0 6px rgba(245,158,11,0.08),inset 0 1px 8px rgba(245,158,11,0.06),0 4px 20px rgba(245,158,11,0.18) !important;}
 .note-detail-box.plus-gold::before{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.2),transparent);animation:shimmer 3s ease-in-out infinite;pointer-events:none;}
-.note-detail-box .detail-plus-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:12px;font-weight:700;letter-spacing:0.05em;box-shadow:0 1px 4px rgba(245,158,11,0.4);vertical-align:middle;}
-.note-card.plus-gold{border:2px solid #f59e0b !important;box-shadow:0 0 0 3px rgba(245,158,11,0.12),0 6px 24px rgba(245,158,11,0.15) !important;position:relative;overflow:hidden;}
+.note-detail-box.plus-gold::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b);pointer-events:none;z-index:1;}
+.note-detail-box .detail-plus-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:13px;font-weight:700;letter-spacing:0.05em;box-shadow:0 2px 8px rgba(245,158,11,0.5);vertical-align:middle;}
+.note-card.plus-gold{border:2px solid #f59e0b !important;box-shadow:0 0 0 3px rgba(245,158,11,0.25),0 0 0 6px rgba(245,158,11,0.08),inset 0 1px 8px rgba(245,158,11,0.06),0 6px 28px rgba(245,158,11,0.18) !important;position:relative;overflow:hidden;}
 .note-card.plus-gold::before{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.2),transparent);animation:shimmer 3s ease-in-out infinite;pointer-events:none;z-index:1;}
-.note-card .plus-cert-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:12px;font-weight:700;letter-spacing:0.05em;box-shadow:0 1px 4px rgba(245,158,11,0.4);vertical-align:middle;}
+.note-card.plus-gold::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b);pointer-events:none;z-index:1;}
+.note-card .plus-cert-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:13px;font-weight:700;letter-spacing:0.05em;box-shadow:0 2px 8px rgba(245,158,11,0.5);vertical-align:middle;}
+.plus-corner-badge{position:absolute;top:5px;left:5px;z-index:5;pointer-events:none;}
+.plus-corner-badge span{display:inline-block;padding:2px 8px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#fff;font-size:9px;font-weight:800;letter-spacing:0.06em;border-radius:3px;box-shadow:0 2px 6px rgba(245,158,11,0.4);line-height:1.5;}
diff --git a/index.html b/index.html
index 4aefc52..e176e08 100644
--- a/index.html
+++ b/index.html
@@ -5840,16 +5840,17 @@ async function showPostCaptchaModal() {
   data-id="${post.id}"
   onclick="openNoteDetail('${post.id}')">
   ${pinHtml}
+  ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
     <div class="note-type">${cfg.emoji} ${post.type}${post.visibility === 'self_only' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅自己可见' : (post.visibility === 'whitelist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 仅指定用户可见' : (post.visibility === 'blacklist' ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 仅指定用户不可见' : ''))}${(post.images && post.images.length) ? ' · <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' + post.images.length : ''}</div>
   <div class="note-content">${renderPostContent(post)}</div>
  <div class="note-footer" onclick="event.stopPropagation()">
  <div class="note-author">
- ${post.userId ? `<a href="user.html?id=${post.userId}" style="text-decoration:none; color:inherit;">` : ''}
+  ${post.userId && !post.isAnonymous ? `<a href="user.html?id=${post.userId}" style="text-decoration:none; color:inherit;">` : ''}
  ${post.avatar && post.avatar.startsWith('data:') ? `<img src="${escHtml(post.avatar)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;" onerror="this.style.display='none'">` : `<span style="font-size:16px;">${post.avatar && post.avatar.length <= 4 ? post.avatar : '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'}</span>`}
- ${post.userId ? '</a>' : ''}
- ${post.userId ? `<a href="user.html?id=${post.userId}" style="text-decoration:none; color:inherit;">` : ''}
-  <span>${post.author}</span>${post.authorAdminRole === 'super' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/></svg> 超管认证' : post.authorAdminRole === 'admin' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg> 普管认证' : ''}${post.authorIsPlus ? '<span class="plus-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>' : ''}
-  ${post.userId ? '</a>' : ''}
+ ${post.userId && !post.isAnonymous ? '</a>' : ''}
+  ${post.userId && !post.isAnonymous ? `<a href="user.html?id=${post.userId}" style="text-decoration:none; color:inherit;">` : ''}
+  <span>${post.author}</span>${post.authorAdminRole === 'super' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/></svg> 超管认证' : post.authorAdminRole === 'admin' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg> 普管认证' : ''}  ${post.authorIsPlus ? '<span class="plus-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>' : ''}
+  ${post.userId && !post.isAnonymous ? '</a>' : ''}
   <span class="note-time">· ${post.time}</span>
  </div>
  <div style="display:flex;gap:4px;align-items:center;">
@@ -6220,7 +6221,7 @@ async function showPostCaptchaModal() {
   // PLUS++ 认证标识
   const plusBadge = document.getElementById('detailPlusBadge');
   if (post.authorIsPlus) {
-    plusBadge.innerHTML = '<span class="detail-plus-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++ 认证</span>';
+    plusBadge.innerHTML = '<span class="detail-plus-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>';
     plusBadge.style.display = '';
   } else {
     plusBadge.style.display = 'none';
@@ -6229,7 +6230,7 @@ async function showPostCaptchaModal() {
   // 同学认证标识
   const certBadge = document.getElementById('detailCertBadge');
  if (post.authorZhixueStatus === 'approved') {
- const certLabel = post.authorZhixueCertType === 'manual' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 已认证' : '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> 已认证';
+  const certLabel = post.authorZhixueCertType === 'manual' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' : '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
   certBadge.innerHTML = certLabel;
  certBadge.style.display = '';
  } else {
@@ -6239,13 +6240,13 @@ async function showPostCaptchaModal() {
  // 设置用户主页链接
  const avatarLink = document.getElementById('detailAvatarLink');
  const authorLink = document.getElementById('detailAuthorLink');
- if (post.userId) {
- const userProfileUrl = `user.html?id=${post.userId}`;
- avatarLink.href = userProfileUrl;
- authorLink.href = userProfileUrl;
- avatarLink.style.cursor = 'pointer';
- authorLink.style.cursor = 'pointer';
- } else {
+  if (post.userId && !post.isAnonymous) {
+  const userProfileUrl = `user.html?id=${post.userId}`;
+  avatarLink.href = userProfileUrl;
+  authorLink.href = userProfileUrl;
+  avatarLink.style.cursor = 'pointer';
+  authorLink.style.cursor = 'pointer';
+  } else {
  // 没有 userId，可能是匿名帖子，移除链接
  avatarLink.href = '#';
  authorLink.href = '#';
diff --git a/post.html b/post.html
index 33f0c7f..83a4b6a 100644
--- a/post.html
+++ b/post.html
@@ -1207,7 +1207,7 @@
     if (post.authorAdminRole === 'super') badges = '<span class="verify-badge">超管</span>';
     else if (post.authorAdminRole === 'admin') badges = '<span class="verify-badge">管理员</span>';
     if (post.authorIsPlus) {
-      badges += '<span class="plus-cert-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++ 认证</span>';
+      badges += '<span class="plus-cert-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>';
     }
     if (post.authorZhixueStatus === 'approved') {
       badges += '<span class="verify-badge">' + (post.authorZhixueCertType === 'manual' ? '已实名' : '已认证') + '</span>';
@@ -1221,6 +1221,7 @@
 
     const html = selfOnlyBanner + `
       <div class="note-card ${cfg.color}${post.authorIsPlus ? ' plus-gold' : ''}" style="background:${colors.bg};color:${colors.text};">
+        ${post.authorIsPlus ? '<div class="plus-corner-badge"><span>PLUS</span></div>' : ''}
         <div class="note-type">${cfg.emoji} ${escHtml(post.type)}</div>
         <div class="note-content">${escHtml(post.content)}</div>
         ${imagesHtml}
