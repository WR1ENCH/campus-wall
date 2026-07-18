# 设计文档：发帖类型彩色圆点 + 全量访问记录

## 任务1：发帖类型选择改为彩色圆点

**HTML 改动**（index.html）：
- `.post-tags` 内的 `<button class="post-tag ...">` 移除 SVG 图标和文字，改为纯色圆形 `<button>`，保留 `data-tag` 和 `onclick`
- 每个类型按钮只保留颜色类（`t-daily/love/tree/lost/event`）作为背景色

**CSS 改动**（index.html）：
- `.post-tag` 重写为 `width:28px;height:28px;border-radius:50%;padding:0`，无文字
- 新增 `@keyframes colorPop` 弹性缩放动画（提交帖子后卡片变色时触发）

**帖子卡片颜色联动**：
- `renderNotes()` 已通过 `typeConfig` CSS 类控制背景色，发帖时类型已存储在 `post.type`，重新渲染后自动匹配颜色
- 新发帖触发 SSE `postUpdate` → `fetchPosts` → `renderNotes`，颜色自然更新

## 任务2：全量访问记录

**后端**（routes/system.js）：
- 新增 `POST /api/page-visit`：接收 `x-user-token`（可选），将访问记录写入 `login_logs`
- `type: 'page_visit'`，`success: 1`
- 已登录用户记录昵称到 `account`，未登录记录 `'游客'`

**前端**（index.html）：
- 页面加载时调用 `POST /api/page-visit` 传递 token

**后台显示**（admin.html）：
- `loadLoginLogs()` 渲染时：`type === 'page_visit'` 显示「访问」徽章（紫色），account 直接显示

## 任务3：测试清单

输出到 `todo.md`，列出精确测试项。
