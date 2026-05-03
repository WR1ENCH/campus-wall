# 📌 校园墙 (Campus Wall)

<p align="center"><i>powered by wr1Ench</i>
  <i>自由主义万岁</i></p>

一个简洁优雅的校园匿名留言板系统，支持发帖、点赞、评论、举报，以及完整的内容管理后台。

![预览图](https://img.shields.io/badge/Node.js-18+-green) ![预览图](https://img.shields.io/badge/Express-4.x-blue) ![预览图](https://img.shields.io/badge/License-GPL%20V3-yellow)

---

## ✨ 功能特色

### 前台功能
- 📝 **多板块发布** — 支持日常、表白、树洞、失物招领、活动五大板块
- ❤️ **点赞互动** — 一键点赞，实时更新热度
- 💬 **评论系统** — 帖子详情页支持查看和发布评论，可点赞、举报评论
- 🔍 **搜索筛选** — 支持关键词搜索、板块筛选、时间排序
- 👤 **用户主页** — 每个用户拥有独立主页，展示个人资料和发布的帖子
- 📝 **资料编辑** — 支持修改昵称、上传头像（JPG格式，500KB以内）
- 📱 **响应式设计** — 完美适配手机和电脑端

### 后台管理
- 📊 **数据看板** — 实时统计帖子总数、今日/本周发帖、累计点赞
- 📈 **可视化图表** — 近7天趋势柱状图、板块分布条形图
- 👥 **用户管理** — 用户列表、封禁/解封、密码重置
- 🔐 **管理员系统** — 首次访问时设置管理员、支持修改管理员密码（需验证旧密码）
- 🚩 **举报处理** — 举报列表、帖子/评论删除、用户警告
- 🗑️ **批量操作** — 批量选择、批量删除帖子

### 安全特性
- 🔑 **PBKDF2 密码哈希** — 100,000次迭代，防暴力破解
- 🎫 **Token 认证** — 24小时自动过期，安全可靠
- 🛡️ **XSS 防护** — 内容自动转义，防止脚本注入
- 🚫 **特殊字符过滤** — 全局禁用特殊符号输入

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18.x
- npm ≥ 9.x

### 安装部署

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd campus-wall

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

服务启动后访问：
- 前台留言板：http://localhost:3000/
- 管理后台：http://localhost:3000/admin.html

### 首次使用
首次打开管理后台时，系统会引导你创建最高管理员账号。

> ⚠️ **请妥善保管账号密码，忘记后需手动修改 `data/admins.json`**

---

## 📁 项目结构

```
campus-wall/
├── index.html      # 前台留言板页面
├── admin.html      # 管理后台页面
├── user.html       # 用户主页页面
├── server.js      # Node.js 后端服务
├── package.json   # 项目配置
├── .gitignore     # Git 忽略规则
├── LICENSE        # GPL v3 开源协议
└── README.md      # 项目说明
```

运行后自动生成：
- `data/posts.json`   — 帖子数据
- `data/users.json`  — 用户数据
- `data/admins.json` — 管理员数据
- `data/reports.json` — 举报记录

---

## 🛠️ API 接口

### 公开接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/posts` | 获取帖子列表 |
| POST | `/api/posts` | 发布新帖子 |
| POST | `/api/posts/:id/like` | 点赞帖子 |
| POST | `/api/report` | 提交举报 |
| GET | `/api/users/:id` | 获取用户信息 |
| GET | `/api/users/:id/posts` | 获取用户发布的帖子 |

### 管理接口（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/me` | 验证登录状态 |
| POST | `/api/admin/init` | 首次初始化管理员 |
| POST | `/api/admin/change-pwd` | 修改管理员密码（需旧密码验证） |
| GET | `/api/admin/stats` | 获取统计数据 |
| GET | `/api/admin/posts` | 管理帖子列表 |
| DELETE | `/api/admin/posts/:id` | 删除帖子 |
| POST | `/api/admin/batch-delete` | 批量删除 |
| GET | `/api/admin/users` | 用户列表 |
| PUT | `/api/admin/users/:id/ban` | 封禁/解封用户 |
| POST | `/api/admin/users/:id/reset-pwd` | 重置用户密码 |
| GET | `/api/admin/reports` | 举报列表 |
| PUT | `/api/admin/reports/:id` | 处理举报 |

### 用户接口（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/me` | 获取当前登录用户信息 |
| PATCH | `/api/user/me` | 更新个人资料（昵称、头像） |

---

## 🎨 技术栈

| 分类 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 前端 | 原生 HTML/CSS/JavaScript |
| 数据 | JSON 文件存储 |
| 安全 | PBKDF2 密码哈希、Token 认证 |
| 图标 | Emoji（原生、无依赖） |

---

## 🔧 二次开发

### 添加新板块
编辑 `index.html`，在板块选择器 `<select id="typeFilter">` 中添加新选项，并在 `server.js` 的发帖逻辑中扩展类型验证。

### 修改默认管理员
首次设置管理员后，如需修改管理员信息，请编辑 `data/admins.json` 文件。

### 部署到生产环境
```bash
# 使用 PM2 守护进程
npm install -g pm2
pm2 start server.js --name campus-wall

# 查看日志
pm2 logs campus-wall
```

---

## 📄 开源协议

GPL v3 License — 可自由使用、修改、分发，但必须开源并保留 LICENSE 文件。

---

## 🙏 致谢

- 图标使用系统 Emoji，无需额外依赖
- 字体使用 Google Noto Sans SC
