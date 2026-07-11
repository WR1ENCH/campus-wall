# Plan: 处罚机制 / 安全中心 / 举报流程重构

> Spec: `docs/spec_punishment_safety_center.md` — Phase 2 Plan（待评审）

## 实现顺序与依赖

```
T1 数据层(db.js)          ┐ 基础，无依赖
T2 lib/penalty.js 封装     ├─ 依赖 T1
T3 routes/reports.js      ├─ 依赖 T1,T2
T4 routes/penalty.js      ├─ 依赖 T1,T2
T5 交互接口加限制          ├─ 依赖 T2（各写接口插 isFeatureBlocked）
T6 admin.html 两页        ├─ 依赖 T3,T4
T7 安全中心前端           ├─ 依赖 T4
T8 被处罚弹窗             ├─ 依赖 T2,T7
T9 自动通知串联           ├─ 贯穿 T3,T4（emit 封装）
T10 验证/冒烟             └─ 依赖全部
```

- **顺序敏感**：`routes/penalty.js` 与 `routes/reports.js` 必须在 `auth.js` **之前**挂载（与 `admin.js` 同理，避免 `/api/admin/:id` 吞掉 `/api/admin/punishments/:id` 等特化路由）。
- **可并行**：T5 各写接口的限制检查相互独立，可分批；T6/T7 前端可并行。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 旧 `reports` 表缺新列，ALTER 需兼容已上线库 | migrate() 内用 `ALTER TABLE reports ADD COLUMN IF NOT EXISTS`（better-sqlite3 不支持 IF NOT EXISTS → 改为 try/catch 执行） |
| 举报 ID 与旧 report 记录共存 | 旧记录 reportId 置空/迁移补生成；列表按有无 reportId 过滤「新版」 |
| 拍卖举报合并后端点冲突 | pickup.js 的 `/api/pickup/report-content/:bidId` 改为委托 reports.js 的 createReport |
| T0/T1 限制漏接某接口 | 集中校验函数 + 全局 grep 所有 POST 写入口复核 |
| 路由挂载顺序破坏 | 严格按 T1 顺序表挂载并启服务冒烟 |

## 验证检查点

- 每完成一个 T，跑 `node server.js` 确认无启动错误。
- T3/T4 完成后用 curl 验证举报生成 REPO-、处罚生成 PUNI-、按 ID 查询。
- T5 完成后用被处罚 token 调各写接口确认 PUNISHED 拦截。
- T8 完成后浏览器打开首页确认弹窗与跳转。
- 最终：安全中心列表/详情、admin 两页、通知含 ID 全链路手测。

## 输出文件约定

- 计划：`tasks/plan.md`（本文件）
- 任务：`tasks/todo.md`
