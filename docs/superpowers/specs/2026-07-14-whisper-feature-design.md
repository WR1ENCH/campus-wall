# 设计文档：悄悄话功能

## 概要
在校园墙系统中新增「悄悄话」功能，实现用户间的私信沟通，包含敏感词检测、霸凌保护、处罚限制、T1通知、签收确认和举报处理。

## 后端改动

### DB 变更（db.js）
- `whispers` 表增加列：`signed` (INTEGER DEFAULT 0), `signTime` (TEXT)
- 通过 `migrate()` 列迁移兼容旧数据

### 唯一ID（lib/uniqueId.js）
- `VALID_PREFIXES` 增加 `'WHIS'`

### 新路由（routes/whispers.js）
| 端点 | 方法 | 鉴权 | 功能 |
|------|------|------|------|
| `/api/whispers` | POST | 用户 | 发送悄悄话：敏感词/霸凌/处罚检测 → 生成 WHIS-ID → 写库 → 通知接收方 |
| `/api/whispers/inbox` | GET | 用户 | 收件箱（收到的悄悄话列表） |
| `/api/whispers/:id/sign` | POST | 用户 | 签收悄悄话（仅接收者可操作） |

### 处罚集成（lib/penalty.js）
- `getReportedContent()` 增加 `whisper` 类型分支，提取内容+发送者作为证据快照

### 路由挂载（server.js）
- `require('./routes/whispers')(app)` 放在 auth.js 之前（无冲突）

## 前端改动（index.html）

### action bar
- 新增「悄悄话」按钮（信封 SVG 图标），位于「找人」按钮左侧
- 点击弹出 `#whisperModal`

### 发悄悄话弹窗 `#whisperModal`
- 搜索栏：复用 `GET /api/users/search`，输入关键词防抖搜索用户
- 用户搜索结果点击选择
- 内容输入框：最多 50 字，实时计数
- 提交按钮：发送前检测处罚限制（前端提示）
- 入场/离场动画：opacity + transform scale + translateY，与现有弹窗风格一致

### 签收弹窗 `#whisperIncomingPopup`
- SSE `noticeUpdate` 事件触发时调 `GET /api/whispers/inbox` 检查未签收的悄悄话
- 弹窗显示：发送者、内容、举报入口（显示「举报」文字）、签收按钮
- 点击签收 → `POST /api/whispers/:id/sign` → 弹窗关闭 → 通知发送方
- 点击举报 → `POST /api/whispers/:id/report`（走统一举报）
- 关闭弹窗后标记为「已阅」避免重复弹出

## 通知流
1. 发送成功 → `emitUserNotice(receiverId, '💬 收到一条悄悄话', 内容摘要, 'T1')`
2. 签收成功 → `emitUserNotice(senderId, '💬 悄悄话已签收', '对方已签收你的悄悄话', 'T1')`

## 举报流
- 举报悄悄话走统一举报 `POST /api/reports`，`type: 'whisper'`
- 与帖子/评论同样的处理流程（后台 `admin.html` 处罚管理）
- `getReportedContent('whisper', whisperId)` 提取证据快照

## 处罚集成
- `whisper` 已存在于 `FEATURES` 数组
- 发送悄前检测 `isFeatureBlocked(userId, 'whisper')`
- T0 全面限制包含悄悄话
