# Spec: 处罚机制 / 安全中心 / 举报流程重构

> 来源：`docs_for_agent.md`（项目全景）+ `functions_update_2.md`（功能更新需求）
> 状态：Phase 1 Specify — 待人工评审 / 修正假设

## Objective

为校园墙引入一套**新版处罚机制**与**安全中心**页面，并重构举报处理流程：

1. 每条用户举报生成全局唯一 **举报 ID**（持久留存，处理完也不删）。
2. 管理员处理举报时，若确认违规，可施加 **处罚**（T0 全禁 / T1 部分禁），生成全局唯一 **处罚 ID**；管理员也可直接按 UID 新建处罚。
3. 被处罚用户仍可登录，但被限制的交互功能按处罚级别/措施生效；访问时弹窗告知并引导至安全中心。
4. 新增**安全中心**页面：展示进行中/历史处罚（含证据、申辩按钮）、本人举报记录（含状态色）。
5. 处罚 / 申诉 / 举报相关节点统一走自动通知（T0/T1），通知内容包含对应 ID。
6. 旧版封禁机制（`users.status` / `banUntil`）声明失效，安全中心只认新版处罚记录。

成功标志：用户在安全中心能看到自己所有新版处罚与举报；管理员能在 `admin.html` 合并后的举报管理与新增的处罚管理中完成「无违规 / 违规→处罚」流程并撤销；被处罚者被限制对应功能且收到弹窗；所有自动通知含 ID。

## Tech Stack

沿用既有栈（见 `docs_for_agent.md` §1）：Node + Express 4 + better-sqlite3，原生前端 SPA，CORS 全开，三类 token 头。新增依赖：**无**（全部用内置能力）。

## Commands

```
npm install
npm start                      # node server.js
npm test                       # 现有 tests/ 目录（如可用）
```

> 注：仓库 `package.json` 未见 test 脚本，验证以「`node server.js` 启动无错 + 手动 curl 接口 + 打开页面」为主。

## Project Structure（增量改动）

```
server.js                      # 挂载新 routes（penalty.js 必须在 auth.js 之前，因 /api/admin/punishments/:id 与 /api/admin/:id 冲突）
db.js                          # migrate(): 新增 punishments / appeals 表；reports 表补 reportId 列
lib/
  penalty.js                   # 新增：getActivePunishment / isFeatureBlocked / emitPunishmentNotice（统一自动通知封装）
  uniqueId.js                  # 扩展 generateId 支持 REPO- / PUNI- 前缀
routes/
  penalty.js                   # 新增：处罚 / 申诉 / 安全中心数据接口
  reports.js 或 posts.js       # 举报流程增强（生成 reportId、合并拍卖举报、详情接口）—— 见 Open Q3
  admin.js                     # 举报管理合并拍卖举报 + 处罚管理页后端
  posts.js / discussions.js / qa.js / pickup.js / user.js  # 在写操作前插入 isFeatureBlocked 校验
*.html / pages/                # 新增 safety.html + pages/safety.html；index.html 侧边栏加入口；post.html 等加被处罚弹窗
admin.html                     # 举报管理（合并拍卖）+ 处罚管理页
```

## Code Style

遵循既有：接口统一返回 `{ ok, msg?, data?, code? }`；后端路由 `module.exports = function(app){...}`；自动通知统一走 `lib/penalty.js` 的 `emitXxx` 封装（吸取 `docs_for_agent.md` §14.4 关于重复写入的教训，不再散落 `notices.push`+`addUserNotification`）。

ID 生成沿用 `generateId(prefix)`：
```js
const reportId = generateId('REPO');   // REPO-[A-Z0-9]{16}
const punishmentId = generateId('PUNI'); // PUNI-[A-Z0-9]{16}
```

功能限制校验（所有交互写接口统一调用）：
```js
const block = isFeatureBlocked(userId, 'post'); // 'post'|'discussion'|'qa'|'vote'|'whisper'|'anonymous_post'|'auction'
if (block) return res.json({ ok:false, code:'PUNISHED', msg:'账号功能受限' });
```

## 数据模型

### 新增/变更表

**`reports`（变更）**：保留现有字段，新增 `reportId TEXT`（REPO- 前缀，创建时生成，`logIdAssignment` 登记）、`handledResult TEXT`('pending'/'no_violation'/'violation')、`punishmentId TEXT`(关联，可空)、`evidenceContent TEXT`(冗余存储被举报内容快照，供安全中心/详情展示图片预览)。

**`punishments`（新增）**
| 字段 | 说明 |
|------|------|
| punishmentId PK | PUNI-[A-Z0-9]{16} |
| userId | 被处罚者 UID |
| level | 'T0'(全禁) / 'T1'(部分禁) |
| reason | 违规原因 |
| measures | JSON 数组，T1 时生效的功能限制（见枚举） |
| durationDays | 0=永久，>0=天数 |
| status | 'active' / 'revoked' / 'expired' |
| sourceReportId | 触发处罚的举报 ID（管理员直接新建时为 null） |
| appealUsed | 0/1 申辩是否已用 |
| appealStatus | 'none'/'pending'/'approved'/'rejected' |
| createdAt / expiresAt(null=永久) / revokedAt / revokedBy | 时间戳 |

**`appeals`（新增）**
| 字段 | 说明 |
|------|------|
| id PK | 自增或 APP- 前缀 |
| punishmentId | 关联处罚 |
| userId | 申辩人 |
| content | 申辩说明 |
| status | 'pending' / 'approved' / 'rejected' |
| createdAt / handledAt / handledBy / resultNote | — |

### 功能限制枚举（feature）
`whisper`(悄悄话) · `anonymous_post`(匿名发帖+拍卖) · `qa`(问答问答) · `post`(发帖+讨论) · `vote`(投票区)。
- T0：上述全部禁止。
- T1：仅 `measures` 列出的禁止。

## Testing Strategy

- 无测试框架脚本；以「接口 curl 冒烟 + 页面手测」验证。
- 关键验证点：举报生成 REPO- ID 且处理后仍在库；T0 禁止全部交互、T1 仅禁止设定项；处罚到期自动转 expired；撤销标记；申诉一次机会 + T0/T1 通知含 ID；安全中心列表/详情正确；admin 合并后拍卖举报可见；路由挂载顺序不破坏 `/api/admin/:id`。

## Boundaries

- **Always**: 改 db 走 migrate()+read/write 接口；新增需保留特殊字符的 body 字段加入 `inputSanitize` 白名单；自动通知统一封装；reportId/punishmentId 持久化。
- **Ask first**: 是否改动 `users.status`/`banUntil` 旧封禁字段（文档称旧机制失效，但需确认是否保留兼容）；新增页面是否纳入桌面 iframe 框（FR×ME_PAGES）。
- **Never**: 删除/降权 wr1Ench；编辑 vendor；提交 .env；让举报 ID 因处理而被删。

## Success Criteria（可测）

1. 提交任一类型举报 → 返回且库中存 `REPO-` ID，管理页可按 ID 查询。
2. 管理员「存在违规行为」→ 生成 `PUNI-` 处罚，被处罚者下次访问弹窗 + T0 通知含处罚 ID。
3. T0 用户无法发帖/讨论/问答/投票/悄悄话/匿名发帖/拍卖；T1 仅受限 `measures` 指定项。
4. 处罚到期（`expiresAt`）自动解除；管理员「撤销处罚」标记 revoked 且列表置灰。
5. 安全中心：进行中/历史处罚、本人举报（状态色）、处罚详情（证据+申辩按钮灰/白）均正确。
6. 申诉：提交→T1 通知；通过→T0 通知+处罚 revoked；失败→T0 通知；每处罚仅 1 次机会。
7. 旧版封禁字段不影响安全中心展示。

## Open Questions（已确认）

1. **ID 前缀**：✅ `REPO-`(举报) / `PUNI-`(处罚) / `APP-`(申诉)。
2. **「校园墙精选」滚动展示内容**：✅ 对应被置顶/精选的 `posts` 条目（`type='featured'`，targetId 为该 post 的 id）。
3. **举报后端落点**：✅ **新建 `routes/reports.js`** 统一收口所有类型举报（含讨论/QA/拍卖），统一生成 reportId 与详情；`pickup.js` 的拍卖举报端点委托该模块。
4. **旧封禁兼容**：✅ `users.banUntil`/`status` 旧机制停用，安全中心只认新 `punishments` 表；被处罚用户登录态不变，仅交互受限。
5. **申诉审核入口**：✅ 放在**处罚管理页**，对每条处罚提供「处理申诉 通过/驳回」；通过则 revoke 处罚并发 T0 通知。
6. **T1 模板**：默认不需要全局默认模板，措施在施加处罚弹窗勾选后存入 `punishments.measures`。
