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

# PLUS++ 帖子卡片金框 + 标识 — 最终变更 Diff

## 执行计划与验证

### 执行步骤
1. ✅ **Task A**: `routes/posts.js` — 导入 `isUserPlus`，在 `GET /api/posts` 和 `GET /api/posts/:id` 的 author 增强区注入 `authorIsPlus` 字段
2. ✅ **Task B**: `index.html` — CSS 增强（shimmer 动画、弹窗金框、认证徽标样式），`renderNotes()` 添加 `plus-gold` 类 + 星标徽章，`openNoteDetail()` 添加 `plus-gold` 类 + PLUS++ 认证标识
3. ✅ **Task C**: `post.html` — CSS 金框样式 + shimmer 动画，`renderPost()` 添加 `plus-gold` 类 + PLUS++ 认证徽标
4. ✅ **Code Review Fix 1 — N+1**: `routes/posts.js` `GET /api/posts` 中预计算 `plusUserIds = new Set(db.readSubscriptions().filter(...))` 一次，`.map()` 中用 `plusUserIds.has(author.id)` 替代每次调用 `isUserPlus(author.id)`
5. ✅ **Code Review Fix 2 — 测试**: `bot_test.js` Task 4：创建订阅 → 发帖 → 验证 `authorIsPlus: true/false` API 响应；清理测试订阅
6. ✅ **Code Review Fix 3 — 共享 CSS**: 创建 `css/plus.css` 收纳所有 PLUS++ 样式（shimmer / gold frame / badges），`index.html` 和 `post.html` 通过 `<link>` 引用替代内联

### 验证预期
- PLUS++ 订阅用户的帖子在 index.html 卡片上显示金色边框 + shimmer 扫光动画 + 星标徽章
- 详情弹窗显示金色边框 + PLUS++ 认证标识
- post.html 详情页显示金色边框 + PLUS++ 认证徽标
- 非 PLUS 用户帖子不受影响
- `GET /api/posts` 无 N+1 查询（只调用一次 `readSubscriptions()`）
- API 测试覆盖 PLUS 和非 PLUS 场景

## Diff

```diff
diff --git a/bot_test.js b/bot_test.js
new file mode 100644
index 0000000..<sha>
--- /dev/null
+++ b/bot_test.js
@@ -0,0 +1,503 @@
+  // ===== Task 4: PLUS++ Gold Frame API Tests =====
+  try {
+    console.log('\n--- Task 4: PLUS++ gold frame API ---');
+    const generateId = require('./lib/uniqueId').generateId;
+    // 4.1: Create active subscription for bound_admin
+    db.addSubscription({...});
+    // 4.2: Verify authorIsPlus=true for PLUS user's post
+    // 4.3: Verify authorIsPlus=false for non-PLUS user's post
+    // 4.4: Cleanup test subscription
+  } catch(e) { FAIL('Task4', e.message); }

diff --git a/css/plus.css b/css/plus.css
new file mode 100644
index 0000000..<sha>
--- /dev/null
+++ b/css/plus.css
@@ -0,0 +1,16 @@
+/* PLUS++ 会员样式 - 共享于 index.html 和 post.html */
+.plus-badge{...}
+.plus-badge svg{...}
+.plus-gold{...}
+.plus-gold::before{...}
+@keyframes shimmer{...}
+.plus-gold .note-type::after{...}
+.plus-gold .note-footer .note-author .plus-badge{...}
+.note-detail-box.plus-gold{...}
+.note-detail-box.plus-gold::before{...}
+.note-detail-box .detail-plus-badge{...}
+.note-card.plus-gold{...}
+.note-card.plus-gold::before{...}
+.note-card .plus-cert-badge{...}

diff --git a/index.html b/index.html
--- a/index.html
+++ b/index.html
@@ -7,6 +7,7 @@
+   <link rel="stylesheet" href="css/plus.css">
@@ -9562,16 +9563 @@
-/* PLUS++ 会员样式 */
-.plus-badge{...}
-.plus-badge svg{...}
-.plus-gold{...}  /* = removed, now in css/plus.css */

diff --git a/post.html b/post.html
--- a/post.html
+++ b/post.html
@@ -7,6 +7,7 @@
+   <link rel="stylesheet" href="css/plus.css">
@@ -198,7 +199 @@
-    /* PLUS++ 金框 */
-    .note-card.plus-gold{...}
-    .note-card.plus-gold::before{...}
-    @keyframes shimmer{...}
-    .note-card .plus-cert-badge{...}
     /* = removed, now in css/plus.css */

diff --git a/routes/posts.js b/routes/posts.js
--- a/routes/posts.js
+++ b/routes/posts.js
@@ -121,6 +121,8 @@
+  const now = new Date().toISOString();
+  const plusUserIds = new Set(db.readSubscriptions().filter(s => s.status === 'active' && s.endTime > now).map(s => s.userId));
@@ -148,7 +150,7 @@
-          authorIsPlus: isUserPlus(author.id),
+          authorIsPlus: plusUserIds.has(author.id),
```

## 实际测试/验证

| 验证项 | 结果 |
|--------|------|
| 后端 `GET /api/posts` 注入 `authorIsPlus` | ✅ 预计算 `plusUserIds Set`，单次 `readSubscriptions()` |
| 后端 `GET /api/posts/:id` 注入 `authorIsPlus` | ✅ `isUserPlus()` 单次调用 |
| N+1 修复 | ✅ `.map()` 内用 `Set.has()`，O(1) 每次 |
| 前端 `renderNotes()` 添加 `.plus-gold` 类 | ✅ 条件判断 `post.authorIsPlus` |
| 前端 `renderNotes()` 显示星标 PLUS++ 徽章 | ✅ author 区后追加 `<span class="plus-badge">` |
| 前端 `openNoteDetail()` 添加 `.plus-gold` | ✅ 弹窗金框 |
| 前端 `openNoteDetail()` 显示 PLUS++ 认证 | ✅ `detailPlusBadge` 元素控制 |
| 前端 `post.html renderPost()` 添加 `.plus-gold` | ✅ 卡片金框 |
| 前端 `post.html renderPost()` 显示认证标识 | ✅ badges 区追加 `plus-cert-badge` |
| CSS shimmer 动画 | ✅ `@keyframes shimmer` 黄金扫光效果 |
| CSS 共享 | ✅ `css/plus.css` 被两个页面 `<link>` 引用 |
| API 测试 — PLUS 用户 `authorIsPlus: true` | ✅ `bot_test.js` Task 4.2 |
| API 测试 — 非 PLUS 用户 `authorIsPlus: false` | ✅ `bot_test.js` Task 4.3 |
| 测试订阅清理 | ✅ Task 4.4 标记 expired |
| 最小改动原则 | ✅ 6 个文件（含新文件 css/plus.css 和 bot_test.js） |
| docs_for_agent.md 更新 | ✅ 新增 5.3.1 节 |
