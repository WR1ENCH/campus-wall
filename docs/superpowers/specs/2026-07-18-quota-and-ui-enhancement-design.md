# 配额控制与 UI 增强设计

## 概述
为校园墙系统新增匿名发帖和悄悄话的配额限制，以及发帖窗口 UI 交互优化。

## 1. 匿名发帖配额（自然日限制）

### 规则
- 每用户每天最多 2 次免费匿名发帖（自然日，0:00 重置）
- 超出后每次需支付 50 credit
- 前端弹窗确认后扣费

### 实现
- `routes/posts.js` POST /api/posts 中 `isAnonymous=true` 时：
  - 从 `posts` 表统计 `userId=当前用户 && isAnonymous=true && time 在今天`
  - count >= 2 → 检查 body `payWithCredit=true` 参数
  - 没有此参数 → 返回 `{ ok:false, code:'ANON_QUOTA_EXCEEDED', msg:'...', cost:50 }`
  - 有此参数 → 检查 credit >= 50 → 扣除 50 + 写 credit_log → 继续发帖
- 前端 `index.html`：`submitNote()` / `createPost()` 中处理 `ANON_QUOTA_EXCEEDED` 弹窗

## 2. 悄悄话配额（自然周限制）

### 规则
- 每用户每周最多 2 次免费悄悄话（自然周，周一 0:00 重置）
- 超出后每次自动扣 200 credit，不足则报错

### 实现
- `routes/whispers.js` POST /api/whispers 中：
  - 统计 `senderId=当前用户 && createdAt 在本周内`（从 whispers 表）
  - count >= 2 → 检查 credit >= 200
  - 自动扣 200 + 写 credit_log

## 3. 信息图标 + 气泡提示

- 移除发帖窗口中 `附图（最多 4 张，每张 ≤ 2MB）` 和 `匿名发布（不显示昵称和头像）` 的文字
- 替换为 SVG info 图标（圆圈 i）
- 点击图标弹出气泡，点击外部/再次点击关闭
- 气泡动画：`opacity` + `transform: scale(0.95)→1` 过渡

## 4. 更多选项展开收起动画

- `postMoreOptions` 从 `display:none/block` 改为 `max-height` + `opacity` 过渡

## 涉及文件
- `routes/posts.js` — 匿名发帖配额检查 + 扣费
- `routes/whispers.js` — 悄悄话配额检查 + 扣费
- `index.html` — 信息图标+气泡 HTML/CSS/JS，更多选项动画，匿名配额弹窗
