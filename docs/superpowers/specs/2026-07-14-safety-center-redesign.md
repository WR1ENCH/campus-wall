# Safety Center 重新设计

> 创建时间: 2026-07-14
> 适用范围: `safety.html` + `pages/safety.html`
> 设计目标: 简约 · 大气 · 流畅,与校园墙整体设计语言统一

---

## 1. 需求回顾

### 1.1 任务原文

> 查看 safety.html, 推翻原有的设计, 结合校园墙的设计, 重新设计页面
> 在『我的举报』和『我的处罚』上方加入一块区域, 分区显示正在受到的处罚和正在处理中的举报
> 一切修改先查阅 docs_for_agent.md, 配色与字体方案必须契合此项目

### 1.2 关键约束(来自 `docs_for_agent.md` §3.9 与 §6.5)

- 后端已存在 `GET /api/user/safety-center` 单接口聚合接口, 返回 `{activePunishment, history, myReports}`
- 桌面端会通过 server.js 的 iframe 设备框(768px 宽)访问, **真实手机 UA 直接原生渲染**
- 前端约定: 全部原生 HTML/CSS/JS, 无构建步骤
- `safety.html` 既要可独立访问(完整页), 又要通过 `pages/safety.html` 在 SPA 内嵌入
- 输入过滤: 用户文本/申诉理由等白名单字段保留特殊字符
- 申诉每处罚仅一次, `appealUsed=1` 即不可再申诉
- `safety.html` 单文件: 含 HTML + CSS + JS(项目其它独立页都是这样)

### 1.3 用户已确认的决策

- 顶部「实时状态区」采用 **横向双栏布局** (桌面左右两列, 移动端自动堆叠)

---

## 2. 设计语言锁定(与现有项目对齐)

### 2.1 色彩 token(继承 + 微调)

```css
:root {
  /* 背景层(沿用 campus-wall 砖墙纸) */
  --bg-brick: #c4a882;        /* 砖墙底色 */
  --bg-brick-light: #d4c5a9;  /* 砖缝浅色 */

  /* 卡片层(沿用 paper-bg) */
  --paper: #fef9e7;           /* 米色纸张 */
  --paper-2: #faf4dc;         /* 阴影面纸张 */
  --paper-edge: #d4c5a9;      /* 纸张描边 */

  /* 文字层(沿用 text-main/sub) */
  --ink: #2c1810;             /* 主文字 - 墨黑 */
  --ink-2: #5a3e2b;           /* 次文字 */
  --ink-3: #8b6f5e;           /* 弱文字 */

  /* 语义色(新定义, 与 user.html 莫兰迪体系协调) */
  --danger: #b91c1c;          /* 严重处罚 - 朱砂红 */
  --danger-bg: #fef2f2;       /* 严重处罚背景 */
  --danger-edge: #fecaca;     /* 严重处罚描边 */

  --warning: #b45309;         /* 部分处罚 - 焦糖橙 */
  --warning-bg: #fef3c7;      /* 部分处罚背景 */
  --warning-edge: #fde68a;    /* 部分处罚描边 */

  --pending: #1d4ed8;         /* 处理中举报 - 静谧蓝 */
  --pending-bg: #eff6ff;      /* 处理中举报背景 */
  --pending-edge: #bfdbfe;    /* 处理中举报描边 */

  --success: #166534;         /* 正常状态 - 墨绿 */
  --success-bg: #f0fdf4;

  /* 装饰(沿用项目风格) */
  --pin: radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b);  /* 砖墙页面图钉 */
  --accent: #8b6f5e;          /* 暖咖主色 */

  /* 尺寸/圆角(沿用项目) */
  --radius: 10px;             /* 卡片圆角 */
  --radius-sm: 6px;           /* 小元素圆角 */
  --radius-lg: 14px;          /* 大卡片圆角 */

  /* 字体 */
  --font-sans: 'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-brush: 'Ma Shan Zheng', 'Noto Sans SC', cursive;  /* 标题毛笔字 */
  --font-mono: 'SF Mono', 'Menlo', 'Consolas', monospace;
}
```

### 2.2 字体策略

- **页面大标题**: `Ma Shan Zheng` 毛笔字 (与 report.html / bully.html 一致)
- **区段标题**: `Noto Sans SC` 700 weight
- **正文/数字/ID**: `Noto Sans SC` 400/500
- **处罚单号/时间码**: `SF Mono` 等宽 (与现有 status-pending 徽章风格一致)
- **图标**: 沿用项目 SVG 1em 风, `stroke-width:2`, `stroke-linecap:round`

### 2.3 动效原则(沿用项目 spring 风格)

| 动画 | 曲线 / 时长 | 用途 |
|------|------------|------|
| 卡片入场 | `fadeUp` 0.5s `cubic-bezier(0.16,1,0.3,1)` | 顶部状态卡 + 列表项 stagger 出现 |
| 弹窗入场 | `modalIn` 0.3s `cubic-bezier(0.34,1.56,0.64,1)` | 申诉弹窗(沿用 notice.html) |
| Tab 切换 | opacity + translateY 0.25s | 面板淡入 |
| 卡片 hover | transform 0.2s ease | translateY(-2px) + 阴影加深 |
| 按钮 active | transform 0.1s | scale(0.97) |
| 展开/折叠 | max-height 0.35s `cubic-bezier(0.4,0,0.2,1)` | 处罚详情展开 |
| 倒计时进度条 | width 1s linear | 进行中处罚剩余时间比例 |
| 徽章脉冲 | 1.5s ease-in-out infinite | 「进行中」徽章呼吸效果 |

**Reduced-motion 支持**: `@media (prefers-reduced-motion: reduce)` 下, 所有动画时长降为 0.01s, 倒计时进度条直接显示终态。

### 2.4 背景与材质

- 沿用 `body` 的砖墙 + 砖缝 + 木纹三层 `repeating-linear-gradient` 叠加
- 卡片用 `var(--paper)` 米色纸, 加 `inset 0 0 0 1px rgba(255,255,255,0.4)` 内高光(项目惯用)
- 顶栏采用 `position: sticky; backdrop-filter: blur(12px); background: rgba(196,168,130,0.7)`(半透明砖色)模仿 user.html 的毛玻璃顶栏

---

## 3. 信息架构

### 3.1 整体结构

```
┌─ 顶栏(sticky, 半透明砖色 + blur) ──────────────────┐
│  ← 返回    🛡️ 安全中心                                │
└──────────────────────────────────────────────────────┘
┌─ 主容器(max-width: 760px, 居中) ─────────────────────┐
│                                                       │
│  ╔══ 实时状态区(新加) ══════════════════════════════╗ │
│  ║  进行中处罚            │  处理中举报             ║ │
│  ║  ┌────────────────┐    │  ┌──────────────────┐  ║ │
│  ║  │ T0 严重违规     │    │  │ 3 项处理中        │  ║ │
│  ║  │ 禁止所有交互    │    │  │  · 帖子-广告     │  ║ │
│  ║  │ 剩 2 天 14 小时  │    │  │  · 评论-人身攻击 │  ║ │
│  ║  │  [查看详情]      │    │  │  · 失物-虚假信息 │  ║ │
│  ║  └────────────────┘    │  └──────────────────┘  ║ │
│  ║  (无处罚时显示"账号正常"绿色空状态)                ║ │
│  ╚══════════════════════════════════════════════════╝ │
│                                                       │
│  ── Tabs(我的举报 · 我的处罚) ──                    │
│  [Tab Content: 全部历史记录, 同旧版]                 │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 3.2 模块详细

#### 3.2.1 实时状态区(新增, 始终在 tabs 上方)

**左栏: 进行中处罚 (1 个)**

- 标题: 「进行中处罚」+ 红色呼吸徽章(若存在)
- 卡片内容(若 `activePunishment`):
  - 顶行: 处罚级别 `T0`/`T1` 徽章 + 单号 `PUNI-xxxxx`(monospace)
  - 原因: 「违规原因:xxxx」
  - 限制功能: T0 → 「所有交互功能」/ T1 → 拼接的措施名
  - 倒计时: 进度条 + 「剩余 X 天 Y 小时」文字; 永久时显示「永久限制」+ 灰色进度条
  - 状态行: 「已申诉(处理中)/ 未申诉」+ 「查看详情」按钮(点击展开)
- 空状态: 绿色勾图标 + 「账号一切正常, 无正在执行的处罚」+ 「合规从我做起」副文案

**右栏: 处理中举报 (列表, 最多显示 3 条 + 「查看全部」)**

- 标题: 「处理中举报」+ 「N 项」数量徽章
- 列表项(若存在):
  - 单号 `REPO-xxxxx` + 举报类型 `帖子`/`评论`/`讨论`/`失物拍卖` 等
  - 理由: 「原因:xxxx」
  - 相对时间: 「3 小时前」/ 「昨天 18:30」
  - 点击可跳到 tabs「我的举报」并定位该条
- 空状态: 蓝色沙漏图标 + 「当前没有处理中的举报」
- 列表底部: 「查看全部举报 →」按钮(切换到「我的举报」tab)

**布局响应**:
- 桌面(> 640px): 2 列 `grid-template-columns: 1fr 1fr; gap: 16px`
- 移动(≤ 640px): 1 列堆叠, 顺序: 进行中处罚 → 处理中举报

#### 3.2.2 Tabs(沿用旧版, 内容区更新)

- 「我的举报」: 显示全部 `myReports` 列表(沿用旧卡片渲染)
- 「我的处罚」: 显示「进行中处罚」+「历史处罚」两个 section(沿用旧逻辑, 但将历史部分用更柔和的视觉)
- Tab 切换: 横向滑动条 + 滑块指示器(类似 modern 风格)
  - 指示器使用 `transform: translateX()` 而非 left, 保证 GPU 加速
  - 内容区 opacity + translateY 0.25s

#### 3.2.3 申诉弹窗(沿用旧版, 视觉升级)

- 沿用现有 `appeal-dialog` 结构
- 升级:
  - 弹窗入场: `modalIn` 关键帧(spring 曲线, 沿用 notice.html)
  - 提交按钮: hover 时 `translateY(-1px)` + 阴影加深
  - 错误/成功 toast: 滑入而非淡入

---

## 4. 关键代码规范

### 4.1 命名

- CSS 类前缀: `.safety-*`(避免与项目其它类冲突)
- JS 函数: 全部 `safetyXxx`(避免与 index.html 共享全局变量冲突)
- 状态: 使用 CSS class 切换, 不使用内联 style

### 4.2 可访问性

- 所有可点击元素: `<button>` 或 `role="button"`
- 状态徽章: `aria-label="状态:处理中"`
- Tab 切换: `aria-selected` 状态
- 申诉弹窗: 打开时 `aria-modal="true"`, 焦点自动落入 textarea
- Reduced-motion: 全局 `@media` 块关闭所有过渡

### 4.3 性能

- 仅动画 `transform` / `opacity`(倒计时进度条 width 除外, 因为不影响布局)
- 进入视图: 用 `IntersectionObserver`(只对「实时状态区」首次入场)
- 倒计时: `requestAnimationFrame` 驱动, 每秒更新 1 次(不是每帧)
- 不引入第三方库, 不上 GSAP / Motion - 项目无构建步骤

### 4.4 安全

- 沿用现有 `escHtml` 防 XSS
- 不使用 `innerHTML +=`, 改用 `textContent` + 受信任的 `escHtml`
- 申诉理由不超过 1000 字(超出截断 + 提示)

---

## 5. API 行为与数据流

### 5.1 数据获取

```js
// 启动时一次性拉取
const res = await api('/api/user/safety-center');
safetyData = res.data;
// safetyData = { activePunishment, history, myReports }
```

### 5.2 实时状态区数据加工

```js
// 进行中处罚
const active = safetyData.activePunishment || null;

// 处理中举报(过滤 + 排序)
const pendingReports = (safetyData.myReports || [])
  .filter(r => r.status === 'pending')
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .slice(0, 3);  // 最多显示 3 条
const pendingTotal = safetyData.myReports.filter(r => r.status === 'pending').length;
```

### 5.3 倒计时计算

```js
function getRemaining(p) {
  if (p.durationDays === 0) return { text: '永久限制', percent: 100, isPermanent: true };
  const start = new Date(p.createdAt).getTime();
  const end = new Date(p.expiresAt).getTime();
  const now = Date.now();
  const total = end - start;
  const passed = now - start;
  const remain = end - now;
  if (remain <= 0) return { text: '即将到期', percent: 100, isPermanent: false };
  return {
    text: formatRemain(remain),  // '2天14小时' / '14小时23分'
    percent: Math.min(100, Math.max(0, (passed / total) * 100)),
    isPermanent: false
  };
}
```

倒计时每秒更新一次(仅当存在 active 处罚时), 离开页面时清除 interval。

### 5.4 提交申诉流程(沿用旧版)

```js
// 1. 点击「申诉」按钮 → openAppeal(punishmentId)
// 2. openAppeal 聚焦 textarea, 显示弹窗(modalIn 动画)
// 3. submitAppeal 校验 → POST /api/user/punishments/:id/appeal
// 4. 成功: 关闭弹窗 + toast 提示 + 重新 loadData()
// 5. 失败: 在弹窗内显示错误, 不关闭
```

---

## 6. 文件改动清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `safety.html` | **完全重写** | 287 行 → 约 600-700 行(增加实时状态区 + 升级动画) |
| `pages/safety.html` | **完全重写** | 4 行占位 → 完整 SPA fragment(包含整个页面的 DOM + 注入逻辑) |

### 6.1 pages/safety.html 同步策略

由于 `pages/safety.html` 是 SPA 内部通过 `X-SPA-Request: 1` 加载的片段, 它需要:
1. 包含完整的 DOM 结构(实时状态区 + tabs + 弹窗)
2. 包含完整的 CSS(因为 SPA 切页时不会自动注入 style)
3. 包含完整的 JS(但需要做去重 - 用 `window.__safetyInited` 标记避免重复绑定)

实现方案: 把所有 HTML/CSS/JS 提取为可重入函数 `initSafetyPage(container)`, 然后:
- `safety.html` 完整独立加载时直接执行 `initSafetyPage(document.body)`
- `pages/safety.html` 在 SPA 切页时调用 `initSafetyPage(fragmentContainer)`

为了**避免在 main 页面 (index.html) 内重复执行安全中心全部功能**, 决定: 
- `pages/safety.html` **只放占位容器** (沿用现状, 简单可靠)
- 在 `safety.html` 中保持完整功能
- 在 `index.html` 中由 `punishPopup` 直接 `window.open('safety.html','_blank')`(已有, 不变)

这样既不破坏现有 SPA 流程, 又能享受 safety.html 完整的新设计。

---

## 7. 验收清单

- [ ] safety.html 在桌面 768px 框架内显示正常
- [ ] safety.html 在真机移动 UA 下显示正常
- [ ] 实时状态区在 active 处罚存在时正确显示, 不存在时显示空状态
- [ ] 实时状态区的「处理中举报」最多 3 条, 数量徽章显示总数
- [ ] 倒计时每秒更新, 进度条平滑过渡
- [ ] 倒计时在 prefers-reduced-motion 下不显示进度条动画
- [ ] Tab 切换有平滑过渡, 内容区淡入
- [ ] 处罚卡片可展开, 展开动画流畅
- [ ] 申诉弹窗使用 spring 入场动画
- [ ] 申诉成功后 toast 提示 + 重新加载数据
- [ ] 所有文本经过 escHtml 防 XSS
- [ ] 无 console error
- [ ] 页面加载后 60fps(肉眼无卡顿)

---

## 8. 风险与权衡

### 8.1 倒计时的精度

**问题**: 服务端返回 `expiresAt` 是时间戳, 客户端时钟可能与服务端有偏差。
**方案**: 仅显示**相对时间**(剩 X 天 Y 小时), 不做精确同步, 接受最多 1-2 分钟误差。每 30 秒重新拉一次 safety-center 数据校准。

### 8.2 大量历史处罚的性能

**问题**: 用户可能有几十条历史处罚。
**方案**: tabs 切换到「我的处罚」时, 历史部分首次展开前 10 条, 「加载更多」按钮展示剩余。

### 8.3 activePunishment 字段缺失

**问题**: API 文档说返回完整 punishment 对象, 但 `measures` 是 JSON 字符串。
**方案**: 渲染前 `JSON.parse` 一次, 失败时降级为「部分功能」。

### 8.4 与 index.html 的 punishPopup 协同

**问题**: index.html 已经有 punishPopup, 主动弹出限制说明。
**方案**: 不改动 index.html; safety.html 中的「进行中处罚」与 punishPopup 数据同源, 视觉上保持一致的设计语言(都用红/橙的 danger/warning 调色)。

---

## 9. 实施顺序(增量交付)

1. 重写 safety.html: 顶栏 + 实时状态区 + tabs + 弹窗 + 全部 CSS/JS
2. 本地起服务, 用 Playwright 验证:
   - 桌面 iframe 框 768px 渲染
   - 移动 UA 渲染
   - 空状态(无处罚、无举报)
   - 满状态(有处罚、有举报)
   - 申诉弹窗开关
3. 同步更新 pages/safety.html 注释, 注明设计已迁移到 safety.html
4. git diff 检查 + 无 console 错误

---

设计文档完成, 待实施。
