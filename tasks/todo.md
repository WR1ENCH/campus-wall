# Tasks: 处罚机制 / 安全中心 / 举报流程重构

> 来源 spec + plan。每个任务含 Acceptance / Verify / Files。按依赖顺序执行。

- [ ] T1 数据层：reports 补列 + 新建 punishments/appeals 表
  - Acceptance: migrate() 后 `reports` 含 reportId/handledResult/punishmentId/evidenceContent；`punishments`、`appeals` 表存在；旧库升级不报错。
  - Verify: `node -e` 连库执行 `SELECT * FROM punishments LIMIT 0` 与 `PRAGMA table_info(reports)` 确认新列。
  - Files: `db.js`

- [ ] T2 lib/penalty.js：处罚校验 + 通知封装 + 内容快照
  - Acceptance: `getActivePunishment(userId)`（按 expiresAt 判 active/expired）、`isFeatureBlocked(userId, feature)`（T0 全禁/T1 仅 measures）、`emitPunishmentNotice`/`emitAppealNotice`/`emitReportReceivedNotice` 统一双写 notices+user_notifications（auto:true，含 ID）、`getReportedContent(type,targetId)` 取证据。
  - Verify: 单测/脚本构造 punishment 记录后调用 isFeatureBlocked 验证 T0/T1 差异。
  - Files: `lib/penalty.js`（新建）

- [ ] T3 routes/reports.js：统一举报入口 + 详情 + 我的举报 + 合并拍卖
  - Acceptance: POST /api/reports（type∈post/comment/discussion/discussion_comment/qa_question/qa_answer/featured/auction）生成 REPO- ID、存证据快照、发 T1 受理通知、广播；GET /api/reports/:reportId 详情；GET /api/user/my-reports 列表（含状态）；pickup.js 拍卖举报委托本模块。
  - Verify: curl 提交各类举报，确认返回 reportId 且库中存在；my-reports 含状态色字段。
  - Files: `routes/reports.js`（新建）, `server.js`（挂载于 auth.js 前）, `routes/pickup.js`（委托）

- [ ] T4 routes/penalty.js：处罚管理 + 申诉
  - Acceptance: 管理员按 UID 新建处罚 POST /api/admin/punishments（生成 PUNI-，发 T0 通知）；列表/详情/撤销（revoke，置 revoked 仍显示）；处罚管理页处理申诉 通过(revoke+T0)/驳回(T0)；用户 POST /api/user/punishments/:id/appeal（T1 通知，appealUsed=1）；GET 我的处罚与安全中心数据。
  - Verify: curl 新建处罚→库有 PUNI-；撤销后 status=revoked；申诉通过→处罚 revoked+通知。
  - Files: `routes/penalty.js`（新建）, `server.js`（挂载于 auth.js 前）

- [ ] T5 交互写接口插入 isFeatureBlocked
  - Acceptance: posts.js(发帖/评论/匿名)、discussions.js(建话题/评论)、qa.js(问/答)、votes.js(投票)、user.js(悄悄话)、pickup.js(出价) 在写操作前校验，违规返回 {ok:false,code:'PUNISHED'}。
  - Verify: 用 T0 用户 token 调各接口均被拦截；T1 仅受限 measures 项。
  - Files: `routes/posts.js` `discussions.js` `qa.js` `votes.js` `user.js` `pickup.js`

- [ ] T6 admin.html：举报管理(合并拍卖) + 处罚管理页
  - Acceptance: 举报列表含 内容/被举报人/举报ID/原因 + 详情按钮（举报人/被举报人昵称+账号+UID、内容ID+内容+图片预览），处理按钮「无违规行为」(确认)/「存在违规行为」(原因预填+措施勾选+时长天,0=永久)；已处理置灰。处罚列表含 UID/时长/原因/处罚ID + 撤销按钮；已撤销置灰；申诉处理入口。
  - Verify: 浏览器 admin.html 走完整「举报→违规→处罚→撤销/申诉」流程。
  - Files: `admin.html`

- [ ] T7 安全中心前端 safety.html + 侧边栏入口
  - Acceptance: 侧边栏加「安全中心」入口(data-spa)；safety.html 展示进行中处罚（点击→详情：类型/功能限制/证据/申辩按钮 白可点·灰禁用 + 说明文字）、历史处罚（仅新版）、我的举报（类型/原因/举报ID/状态色）。
  - Verify: 浏览器打开安全中心，数据与服务端一致。
  - Files: `safety.html`（新建）, `pages/safety.html`（新建）, `index.html`（侧边栏 + FR×ME_PAGES 登记）

- [ ] T8 被处罚弹窗
  - Acceptance: 被处罚(active)用户访问校园墙弹白底圆角流畅动画居中三角警告 + 说明文案（加粗）+「查看详情」→跳转安全中心对应处罚详情。
  - Verify: 用 active 处罚用户登录，首页弹出并跳转正确。
  - Files: `index.html`(或 spa 壳) + `pages/` 片段

- [ ] T9 自动通知串联复核
  - Acceptance: 举报受理(T1)、处罚下发(T0)、申诉请求(T1)、申诉通过(T0)、申诉失败(T0) 全部经 emit 封装且内容含对应 ID；SSE noticeUpdate 触发前端刷新。
  - Verify: 全流程跑通后查 notices/user_notifications 记录含 ID 与正确 level。
  - Files: `lib/penalty.js` `routes/reports.js` `routes/penalty.js`

- [ ] T10 集成冒烟与文档
  - Acceptance: `node server.js` 正常启动；核心接口 curl 全绿；spec 更新实际偏差；README/spec 标注新表与挂载顺序约束。
  - Verify: 启动日志无错 + 上述 T 的 Verify 全部通过。
  - Files: `docs/spec_punishment_safety_center.md`
