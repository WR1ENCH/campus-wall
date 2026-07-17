# Campus Wall 介绍页设计文档

> **日期：** 2025-07-15
> **状态：** 已批准
> **方案：** 方案 A - 编辑式叙事流
> **风格系统：** Monopo Saigon

---

## 1. 项目概述

### 1.1 目标

为 Campus Wall（校园墙）项目创建一个面向用户的介绍页/landing page，展示项目的功能价值、技术实力和品牌愿景。

### 1.2 目标受众

- **学生/用户** - 了解功能，引导使用
- **学校管理者/老师** - 了解管理能力和安全性
- **开发者/技术社区** - 了解技术架构和开源价值

### 1.3 核心诉求

让访问者**了解项目价值**，全面展示校园墙的功能全景、情感品牌、技术亮点。

### 1.4 设计语言

- **Design Read:** Product landing page for general audience, editorial magazine language, native CSS + monopo saigon design tokens + scroll-driven motion
- **Dial Settings:**
  - `DESIGN_VARIANCE: 8` (Artsy, asymmetric)
  - `MOTION_INTENSITY: 6` (Fluid CSS transitions)
  - `VISUAL_DENSITY: 3` (Art Gallery, airy)

---

## 2. 设计系统 Tokens

### 2.1 颜色

| 名称 | 值 | 用途 |
|------|-----|------|
| Obsidian | `#000000` | 主文字、暗色背景 |
| Paper | `#ffffff` | 浅色背景、深色表面文字 |
| Inkstone | `#181818` | Footer 正文 |
| Felt Gray | `#6d6d6d` | 辅助文字、 muted 信息 |
| Slate Pill | `#636363` | 按钮填充 |
| Ash Mist | `#9a9a9a` | 禁用状态 |
| Pewter | `#808080` | Hover 状态 |
| Iridescent Fade | `linear-gradient(90deg, rgb(160, 224, 171), rgb(255, 172, 46) 50%, rgb(165, 45, 37))` | Hero 渐变（唯一彩色） |

### 2.2 字体

| 字体 | 替代 | 权重 | 用途 |
|------|------|------|------|
| Roobert | Inter / Söhne | 300, 400, 600 | 主字体（标题、正文、导航） |
| Raleway | Montserrat / Jost | 400 | 特定标题装饰 |
| system-ui | — | 400 | 微型 UI 标签 |

### 2.3 排版 Scale

| 角色 | 大小 | 行高 | 字重 | Token |
|------|------|------|------|-------|
| Display | 225px | 1.25 | 400 | Hero 主标题 |
| Heading LG | 94px | 0.76 | 400 | 数字展示 |
| Heading | 78px | 1.10 | 300 | Section 标题（whisper） |
| Subheading LG | 45px | 1.15 | 400 | 引用文字 |
| Subheading | 39px | 1.19 | 400 | 功能标题 |
| Body | 18px | 1.58 | 400 | 正文 |
| Body SM | 16px | 1.58 | 400 | 功能描述 |
| Caption | 12px | 1.19 | 400 | 标签/元信息 |

### 2.4 间距与形状

| 属性 | 值 |
|------|-----|
| 基础单位 | 4px |
| 页面最大宽度 | 1078px |
| Section gap | 46px |
| Card padding | 34px |
| Element gap | 14px |

**Border Radius：**
- 按钮/标签：`75px` (full pill)
- 卡片/图片/输入框：`0px` (sharp)

### 2.5 动效

- **缓动函数：** `cubic-bezier(0.19, 1, 0.22, 1)` (ease-out)
- **持续时间：**
  - Transform：`0.8s - 1.25s`
  - Color/Opacity：`0.4s - 0.8s`
- **Reduced Motion：** 必须尊重 `prefers-reduced-motion`

---

## 3. 页面结构

### 3.1 Section 1: Hero（全屏彩虹渐变）

**视觉特征：**
- 全视口高度 (`100dvh`)
- 流动彩虹渐变背景（唯一彩色区域）
- 居中排版

**内容：**
```
主标题：校园墙 (225px Display)
副标题：让校园里的每一张便利贴，都被看见 (18px Body)
```

**交互元素：**
- 底部左侧：旋转 SCROLL DOWN 徽章 SVG
- 无 CTA 按钮（Hero 即是主角）

**实现要点：**
- 使用 CSS animation 让渐变缓慢流动
- 徽章使用 `@keyframes rotate` 无限旋转
- 文字使用 `#ffffff`，确保对比度

---

### 3.2 Section 2: 品牌宣言（白色背景）

**视觉特征：**
- 白色背景 (`#ffffff`)
- 容器 `1078px` 居中
- 上下 padding `152px`
- 左对齐

**内容：**
```
标题：不止是一面墙 (78px Whisper Weight)
正文：
校园墙是一个数字化的校园广场。在这里，学生可以匿名或实名分享想法、
提问求助、参与讨论、投票表决。它是便利贴的数字化延伸——
每一张"贴子"都可能开启一段对话、解决一个问题、连接两个人。
我们相信，校园里最真实的声音，值得被听见。
(18px Body, max-width 65ch)
```

---

### 3.3 Section 3: 功能全景（白色背景）

**视觉特征：**
- 白色背景
- 容器 `1078px` 居中
- 非对称交替布局（左文右图 ↔ 左图右文）
- Section gap `46px`

**功能模块列表（6 个）：**

| 序号 | 功能 | 布局 | 描述要点 |
|------|------|------|----------|
| 1 | 匿名帖子 | 左文右图 | 分享想法，实名或匿名，点赞评论举报，敏感词过滤 |
| 2 | 讨论区 | 左图右文 | 创建话题，参与讨论，嵌套评论 |
| 3 | QA 悬赏问答 | 左文右图 | 提问悬赏，回答采纳，积分奖励 |
| 4 | 投票表决 | 左图右文 | 创建投票，多选支持，IP 防刷 |
| 5 | 校园通知 | 左文右文 | 发布通知，置顶管理，同步到墙 |
| 6 | 安全中心 | 左图右文 | 信用分体系，处罚机制，霸凌保护 |

**每个模块的排版：**
- 标题：`39px / Roobert 400 / #000000`
- 描述：`16px / line-height 1.58 / #6d6d6d`
- 图片：`0px radius / no shadow`

---

### 3.4 Section 4: 数字证据（暗色全宽条带）

**视觉特征：**
- 暗色背景 (`#000000`)
- 全宽（突破容器）
- 上下 padding `96px`

**内容（4 个指标）：**

| 数字 | 标签 |
|------|------|
| 16+ | 功能模块 |
| 实时 | 消息推送 |
| 匿名 | 安全表达 |
| 校园 | 专属社区 |

**排版：**
- 数字：`94px / Roobert 400 / line-height 0.76 / #ffffff`
- 标签：`12px / uppercase / letter-spacing 0.05em / #6d6d6d`

**数据来源：**
- 可从 `/api/stats` 接口动态获取
- 或使用静态 mock 数据

---

### 3.5 Section 5: 技术架构（白色背景）

**视觉特征：**
- 白色背景
- 容器 `1078px` 居中
- 上下 padding `152px`
- 左对齐

**内容：**

```
标题：构建于现代技术栈之上 (78px Whisper Weight)
描述：
后端采用 Node.js + Express，数据存储使用 SQLite (better-sqlite3)，
前端是原生 HTML/CSS/JS 的 SPA，无需构建步骤。
支持微信小程序端，通过 SSE 实现实时消息推送。
安全性方面，使用 PBKDF2 密码哈希、AES-256 实名加密、
HMAC-SHA256 Token 签名。
(18px Body)
```

**技术栈标签云：**
```
Node.js · Express · SQLite · Better-SQLite3 ·
原生 HTML/CSS/JS SPA · 微信小程序 ·
SSE 实时推送 · PBKDF2 加密 · AES-256 ·
滑块验证码 · 敏感词过滤
```

标签样式：`12px / 1px solid #000000 / transparent bg / 75px radius`

---

### 3.6 Section 6: 适用场景（暗色背景）

**视觉特征：**
- 暗色背景 (`#000000`)
- 全宽
- 上下 padding `152px`
- 2x2 网格布局

**4 个场景卡片：**

| 角色 | 场景描述 |
|------|----------|
| 👤 学生 | 匿名分享想法、参与讨论、悬赏提问、投票表决 |
| 🏫 管理员 | 发布通知、管理内容、处理举报、维护秩序 |
| 📱 移动端 | 微信小程序随时随地访问校园墙 |
| 🔒 安全 | 信用分体系、处罚机制、霸凌保护 |

**卡片样式：**
- `0px border-radius`
- `1px solid rgba(255,255,255,0.15)`
- 无阴影
- 图标：`48px`
- 标题：`18px / Roobert 400 / #ffffff`
- 描述：`14px / line-height 1.58 / #6d6d6d`

---

### 3.7 Section 7: CTA / Footer（白色背景）

**视觉特征：**
- 白色背景
- 容器 `1078px` 居中
- 上下 padding `152px`
- CTA 区域居中对齐

**CTA 内容：**
```
标题：准备好开始了吗？ (78px Whisper Weight, center)
按钮：进入校园墙 (Ghost Pill Button, Light Surface)
```

**按钮样式：**
- `transparent background`
- `1px solid #000000 border`
- `75px border-radius`
- `11px vertical / 33px horizontal padding`
- `16px / Roobert 400 / #000000`

**Footer 内容（3 列地址块风格）：**
```
列 1: 项目
       GitHub · Gitee · 微信小程序
       MIT License

列 2: 资源
       API 文档 · 贡献指南 · 问题反馈

列 3: 关于
       Campus Wall © 2024
       让校园里的每一张便利贴都被看见
```

Footer 样式：
- `11px / line-height 1.36 / #6d6d6d`
- 链接：无下划线、无圆角

---

## 4. 交互与动效

### 4.1 滚动行为

- **Scroll Reveal:** 各 section 进入视口时的淡入上移动画
- **Stagger:** 功能模块列表依次入场（delay `0.06s` each）
- **Parallax:** Hero 区域轻微视差效果（可选）

### 4.2 Hover 状态

- **链接：** color 变化 + letter-spacing 微增
- **按钮：** border opacity 变化
- **卡片：** border color 变亮

### 4.3 Reduced Motion

所有动画必须检测 `prefers-reduced-motion: reduce`，降级为静态或即时过渡。

---

## 5. 响应式设计

### 5.1 断点

| 断点 | 宽度 | 布局变化 |
|------|------|----------|
| Mobile | < 768px | 单列堆叠，字体缩小 |
| Tablet | 768px - 1024px | 适度调整间距 |
| Desktop | > 1024px | 完整布局 |

### 5.2 移动端适配

- Hero 标题：`clamp(78px, 15vw, 225px)`
- Section 标题：`clamp(39px, 8vw, 78px)`
- 功能模块：单列堆叠
- 场景网格：2x2 → 单列
- Footer：单列堆叠

---

## 6. 文件结构

```
intro.html              # 介绍页完整文件（独立可访问）
pages/intro.html        # SPA 片段（可选）
assets/intro/           # 介绍页专用资源（如有）
```

**集成到现有项目：**
1. 在 `server.js` 的 `PAGE_MAP` 添加 `'./intro.html': 'pages/intro.html'`
2. 在导航中添加 `<a data-spa href="/intro.html">` 链接

---

## 7. 性能与可访问性

### 7.1 性能目标

- LCP < 2.5s
- INP < 200ms
- CLS < 0.1

### 7.2 可访问性 (WCAG 2.1 AA)

- 所有交互元素键盘可访问
- 颜色对比度 ≥ 4.5:1 (正文), ≥ 3:1 (大文本)
- ARIA 标签语义化
- Focus management 正确
- 支持 screen reader

---

## 8. 实现注意事项

### 8.1 遵循现有模式

- 使用原生 HTML/CSS/JS（与项目一致）
- 不引入新的构建工具
- 复用现有的 design tokens（如需调整，在 intro.html 内独立定义）

### 8.2 Monopo Saigon 规则检查

- [x] 仅 hero 区域使用彩色渐变
- [x] 其他区域严格黑白灰
- [x] 按钮 75px radius，其他 0px
- [x] 无 box-shadow
- [x] 大标题 whisper weight (300)
- [x] 紧凑行高 (>78px 时 0.70-0.76)
- [x] cubic-bezier(0.19, 1, 0.22, 1) 缓动
- [x] 链接无下划线无圆角
- [x] 页面最大宽度 1078px

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2025-07-15 | 初始设计文档，已批准 |
