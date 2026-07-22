## AGENT职责
认真阅读本文件的Diff部分，调用ponytail插件,superpower插件以及所有代码审查skills，认真审查这些代码


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

# diff
diff --git a/docs_for_agent.md b/docs_for_agent.md
index ce5e75f..7fb1e48 100644
--- a/docs_for_agent.md
+++ b/docs_for_agent.md
@@ -535,7 +535,8 @@ admin → auth → user → posts → discussions → qa → votes → notices
 | 方法 | 路径 | 权限 | 说明 |
 |------|------|------|------|
 | GET | `/api/votes` | 无 | 投票列表 |
-| POST | `/api/votes` | 用户 | 创建投票 |
+| POST | `/api/notice/votes` | 学生会/管理员 | 创建投票（notice.html 前端调用；需 `x-sc-token` 或 `x-admin-token`，路由 `_resolveAdminOrSC`） |
+| POST | `/api/votes` | 管理员 | 创建投票（需 `x-admin-token`，`requireAdmin`） |
 | GET | `/api/votes/:id` | 无 | 投票详情 |
 | DELETE | `/api/votes/:id` | 用户/管理员 | 删除 |
 | PUT | `/api/votes/:id` | 管理员 | 编辑 |
diff --git a/notice.html b/notice.html
index 1819cf2..f680518 100644
--- a/notice.html
+++ b/notice.html
@@ -1727,7 +1727,7 @@ body {
             '</div>' : '') +
           '</div>' +
           '<div class="notice-meta">' +
-          '<span>' + ICONS.user + ' ' + escHtml(n.author || '\u5B66\u751F\u4F1A') + '</span>' +
+          '<span>' + ICONS.user + ' ' + escHtml(n.author || '\u6821\u56ED\u5899') + '</span>' +
           '<span>' + ICONS.calendar + ' ' + time + '</span>' +
           '</div></div>';
       });
@@ -1944,7 +1944,7 @@ body {
     btn.disabled = true; btn.textContent = '\u53D1\u5E03\u4E2D\u2026';
 
     try {
-      var res = await fetch('/api/votes', {
+      var res = await fetch('/api/notice/votes', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'x-sc-token': localStorage.getItem(SC_TOKEN_KEY) || '' },
         body: JSON.stringify({
