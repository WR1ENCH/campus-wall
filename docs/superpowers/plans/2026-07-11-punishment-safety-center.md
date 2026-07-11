# 处罚机制 / 安全中心 / 举报流程重构 — 实现计划

> **For agentic workers:** 按任务顺序逐个实现。步骤使用 `- [ ]` 语法跟踪。

**目标：** 完成 `functions_update_2.md` 全部要求：统一举报（REPO- ID）、处罚机制（PUNI- ID / T0/T1）、安全中心页面、制裁弹窗、admin 举报管理（合并拍卖）+ 处罚管理。

**架构：** 后端新增 `routes/penalty.js`（处罚/申诉/安全中心 API）；`lib/penalty.js` 及 `routes/reports.js` 已存在但未接线；需挂载新路由、移除旧冲突端点、在写操作前插 `isFeatureBlocked` 校验；前端新增 `safety.html` + `pages/safety.html` + admin.html 两页 + index.html 弹窗。

**现有代码状态：** T1(db 表 + 迁移) / T2(lib/penalty.js) / T3(routes/reports.js) 代码已写但未接线；`routes/penalty.js` 不存在；`isFeatureBlocked` 未在任何 route 调用；`routes/reports.js` 未挂载；posts.js 旧 `POST /api/reports` 与新 reports.js 冲突。

---

### Task 1: 创建 routes/penalty.js（处罚/申诉/安全中心 API）

**Files:**
- Create: `routes/penalty.js`
- Test: `node server.js` 启动无错

**Interfaces:**
- Consumes: `lib/penalty.js` (getActivePunishment, isFeatureBlocked, emitUserNotice, notifyXxx), `lib/uniqueId.js` (generateId), `db.js` (readPunishments, writePunishments, insertPunishment, updatePunishment, readAppeals, insertAppeal, readReports, readNotices, writeNotices, addUserNotification)
- Produces: 下列端点

端点清单：
- `GET /api/admin/punishments` — 处罚列表
- `GET /api/admin/punishments/:id` — 处罚详情
- `POST /api/admin/punishments` — 新建处罚（userId, level, measures, reason, durationDays, sourceReportId）
- `POST /api/admin/punishments/:id/revoke` — 撤销处罚
- `POST /api/admin/punishments/:id/appeal-action` — 处理申诉 { action: 'approved'|'rejected', note }
- `GET /api/user/punishments` — 我的处罚（active + history）
- `GET /api/user/punishments/:id` — 处罚详情含证据
- `POST /api/user/punishments/:id/appeal` — 提交申诉 { content }
- `GET /api/user/safety-center` — 聚合安全中心数据

### Task 2: 功能限制接线（isFeatureBlocked）

**Files:**
- Modify: `routes/posts.js`, `routes/discussions.js`, `routes/qa.js`, `routes/votes.js`, `routes/user.js`, `routes/pickup.js`

在以下写操作前插入 `isFeatureBlocked(userId, feature)` 校验：
- posts.js: 发帖/评论/匿名发帖 → feature: 'post'/'anonymous_post'
- discussions.js: 建话题/评论 → feature: 'post'
- qa.js: 提问/回答 → feature: 'qa'
- votes.js: 投票 → feature: 'vote'
- user.js: 悄悄话 → feature: 'whisper'
- pickup.js: 出价 → feature: 'auction'

### Task 3: server.js 挂载 + 冲突修复 + admin.js 后端更新

**Files:**
- Modify: `server.js`, `routes/posts.js`, `routes/admin.js`

- server.js: 在 admin 前挂载 `require('./routes/penalty')(app)` 和 `require('./routes/reports')(app)`
- posts.js: 删除/注释旧的 `POST /api/reports`（566 行），导出 `createReport` 供 admin 调用
- admin.js: 更新 `GET /api/admin/reports` 返回 reportId 等新字段；更新 `POST /api/admin/reports/:id/handle` 支持新处理结果；增加拍卖举报合并

### Task 4: admin.html — 举报管理(合并拍卖) + 处罚管理

**Files:**
- Modify: `admin.html`

后端新增 JS 区段：
- 举报管理：列表(内容/被举报人/举报ID/原因) + 详情按钮(举报人/被举报人信息 + 内容 ID/内容/图片预览) + 处理弹窗(无违规确认 / 存在违规填写原因预填+措施勾选+时长) + 已处理置灰
- 处罚管理：列表(UID/时长/原因/处罚ID) + 撤销按钮 + 已撤销置灰 + 申诉处理入口

### Task 5: 安全中心前端 safety.html + 侧边栏

**Files:**
- Create: `safety.html`, `pages/safety.html`
- Modify: `index.html` (侧边栏), `server.js` (FRAME_PAGES + PAGE_MAP)

- safety.html: 进行中处罚(点击→详情:类型/功能限制/证据/申辩按钮白可点·灰禁用+说明)、历史处罚(仅新版)、我的举报(类型/原因/举报ID/状态色)
- index.html 侧边栏加入 <a data-spa href="/safety.html"> 安全中心
- server.js: FRAME_PAGES 加 safety.html, PAGE_MAP 加 '/safety.html'

### Task 6: 被处罚弹窗

**Files:**
- Modify: `index.html` (或 spa 壳)

- 页面加载时若用户有 active punishment → 弹窗：白底圆角动画、居中三角警告、加粗说明文案、「查看详情」→跳转安全中心

### Task 7: 验证 + 收尾

- `node server.js` 启动无错
- curl 冒烟：举报生成 REPO-、处罚生成 PUNI-、功能限制拦截
- 通知含 ID 复核
- 更新 `docs_for_agent.md` API 记录
