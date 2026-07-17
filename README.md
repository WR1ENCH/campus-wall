# Campus Wall - 校园匿名留言板系统

一个现代化的中学校园匿名留言板系统，支持发帖、评论、点赞、讨论区、QA悬赏问答、投票、校园通知、失物/捡漏拍卖、霸凌举报、反馈、实名认证、积分体系等功能。

## 🚀 核心功能详解

### 1. 用户系统

**功能特点**:
- 用户注册与登录（支持普通注册和智学网认证）
- 个人资料管理（昵称、头像、简介等）
- 智学网实名认证
- 信任浏览器功能（自动登录）
- 每日签到（获得积分奖励）
- 用户搜索和资料查看

**使用方法**:
- 注册：首页点击"注册"按钮，填写用户名、密码、昵称
- 登录：首页输入账号密码登录
- 智学认证：登录后进入个人页面，点击"智学认证"
- 签到：每日首次访问首页可进行签到

**相关API**:
- `POST /api/user/register` - 用户注册
- `POST /api/user/login` - 用户登录
- `POST /api/user/zhixue-login` - 智学网登录
- `GET /api/user/me` - 获取当前用户信息
- `PATCH /api/user/me` - 修改个人资料
- `POST /api/user/checkin` - 每日签到

### 2. 帖子系统

**功能特点**:
- 匿名发帖（可选）
- 帖子点赞和取消点赞
- 评论功能（支持嵌套评论）
- 帖子举报系统
- 敏感词自动检测
- 热度计算和排序
- 帖子置顶功能

**使用方法**:
- 发帖：首页点击"发帖"按钮，填写标题和内容
- 点赞：点击帖子下方的点赞按钮
- 评论：在帖子详情页点击"评论"按钮
- 举报：在帖子或评论下方点击"举报"按钮

**相关API**:
- `POST /api/posts` - 创建帖子
- `GET /api/posts` - 获取帖子列表
- `GET /api/posts/:id` - 获取帖子详情
- `POST /api/posts/:id/like` - 点赞/取消点赞
- `POST /api/posts/:id/comments` - 添加评论
- `POST /api/posts/:id/report` - 举报帖子

### 3. 讨论区

**功能特点**:
- 创建讨论话题
- 参与讨论
- 讨论区举报
- 话题置顶和删除
- 讨论频率限制（1分钟最多5次）

**使用方法**:
- 创建话题：讨论区页面点击"创建话题"按钮
- 参与讨论：在话题详情页添加评论
- 举报：在讨论或评论下方点击"举报"按钮

**相关API**:
- `POST /api/discussions` - 创建讨论话题
- `GET /api/discussions` - 获取讨论列表
- `GET /api/discussions/:id/comments` - 获取讨论评论
- `POST /api/discussions/:id/comments` - 添加讨论评论
- `POST /api/discussions/:id/report` - 举报讨论

### 4. QA悬赏问答

**功能特点**:
- 提问悬赏积分
- 回答问题
- 采纳最佳答案
- 答案点赞
- 悬赏发放

**使用方法**:
- 提问：你问我答页面点击"提问"按钮，设置悬赏积分
- 回答：在问题详情页点击"回答"按钮
- 采纳：问题发布者点击"采纳"按钮选择最佳答案
- 发放悬赏：采纳答案后点击"发放悬赏"

**相关API**:
- `POST /api/qa/questions` - 提问
- `GET /api/qa/questions` - 获取问题列表
- `POST /api/qa/questions/:id/answers` - 回答问题
- `POST /api/qa/questions/:id/accept/:aid` - 采纳答案
- `GET /api/qa/questions/:id/reward` - 发放悬赏

### 5. 投票系统

**功能特点**:
- 创建投票
- 多选投票支持
- 投票结束时间设置
- 投票结果查看
- IP去重防刷票

**使用方法**:
- 创建投票：投票页面点击"创建投票"按钮
- 参与投票：在投票详情页选择选项并提交
- 结束投票：投票创建者或管理员可结束投票

**相关API**:
- `POST /api/votes` - 创建投票
- `GET /api/votes` - 获取投票列表
- `POST /api/votes/:id/vote` - 投票
- `POST /api/votes/:id/end` - 结束投票

### 6. 校园通知

**功能特点**:
- 发布校园通知
- 通知置顶和删除
- 通知同步到墙
- 通知发布申请（需审核）
- 多级通知（T1/T2等）

**使用方法**:
- 发布通知：通知页面点击"发布通知"按钮
- 置顶通知：管理员可在后台置顶
- 申请发布权限：普通用户可申请通知发布权限

**相关API**:
- `POST /api/notices` - 发布通知
- `GET /api/notices` - 获取通知列表
- `POST /api/notices/:id/pin` - 置顶通知
- `POST /api/notice-account/apply` - 申请通知发布权限

### 7. 失物/捡漏拍卖

**功能特点**:
- 发布失物招领信息
- 发布捡漏拍卖信息
- 出价竞拍
- 拍卖内容审核
- 拍卖举报处理

**使用方法**:
- 发布信息：失物/捡漏页面点击"发布"按钮
- 出价：在拍卖详情页点击"出价"按钮
- 审核通过：管理员审核拍卖内容

**相关API**:
- `POST /api/pickup/bid` - 出价
- `GET /api/pickup/auctions` - 获取拍卖列表
- `POST /api/pickup/report-content/:bidId` - 举报拍卖内容
- `POST /api/admin/pickup/review/:bidId` - 审核拍卖

### 8. 霸凌举报

**功能特点**:
- 霸凌事件举报
- 目击者举报支持
- 紧急模式（当事人举报）
- 涉事用户列表
- 相关内容关联
- 霸凌处理结果

**使用方法**:
- 举报：霸凌举报页面填写举报信息
- 添加涉事用户：搜索并添加涉事用户
- 提交举报：填写完整信息后提交

**相关API**:
- `POST /api/bullying-report` - 提交霸凌举报
- `GET /api/admin/bullying` - 获取霸凌举报列表
- `POST /api/admin/bullying/:id/process` - 处理霸凌举报

### 9. 反馈系统

**功能特点**:
- 用户反馈提交
- 反馈状态跟踪
- 反馈处理通知

**使用方法**:
- 提交反馈：反馈页面填写反馈内容
- 查看状态：在个人页面查看反馈处理状态

**相关API**:
- `POST /api/feedback` - 提交反馈

### 10. 处罚机制

**功能特点**:
- 两级处罚系统（T0全面限制/T1部分限制）
- 处罚自动过期
- 处罚叠加规则
- 申诉处理
- 处罚证据快照

**使用方法**:
- 处罚通知：被处罚用户会收到通知
- 查看详情：在安全中心查看处罚信息
- 提交申诉：在处罚详情页提交申诉

**相关API**:
- `GET /api/user/punishments` - 获取用户处罚
- `POST /api/user/punishments/:id/appeal` - 提交申诉
- `GET /api/admin/punishments` - 获取处罚列表

### 11. 信用分系统

**功能特点**:
- 用户行为评分体系
- 信用分 thresholds 控制功能权限
- Credit兑换信用分
- 信用分日志记录
- 季度重置机制

**使用方法**:
- 查看信用分：在安全中心查看信用分信息
- 兑换信用分：使用积分兑换信用分
- 查看日志：查看信用分变动记录

**相关API**:
- `GET /api/user/credibility-info` - 获取信用分信息
- `POST /api/user/exchange-credibility` - 兑换信用分
- `GET /api/user/credibility-logs` - 获取信用分日志

### 12. 积分体系

**功能特点**:
- 积分获取（签到、发帖、评论等）
- 积分消耗（兑换商品、服务）
- 积分卡密生成和兑换
- 积分日志记录
- 积分总览和管理

**使用方法**:
- 获得积分：签到、发帖、评论等
- 兑换积分：使用卡密兑换积分
- 查看积分：在个人页面查看积分余额

**相关API**:
- `POST /api/user/redeem-credit` - 兑换积分
- `GET /api/user/credit-logs` - 获取积分日志
- `GET /api/admin/credit/overview` - 获取积分总览

### 13. 实时推送

**功能特点**:
- SSE实时事件推送
- 帖子更新通知
- 通知更新通知
- 心跳保活机制

**使用方法**:
- 实时更新：前端自动接收SSE事件更新内容

**相关API**:
- `GET /api/stream` - 建立SSE连接

### 14. 微信小程序

**功能特点**:
- 移动端访问
- 共享后端API
- 原生小程序体验

**使用方法**:
- 打开微信小程序
- 访问校园墙功能

### 15. 安全中心

**功能特点**:
- 我的举报列表
- 我的处罚列表
- 信用分概览
- 信用分兑换
- 处罚申诉

**使用方法**:
- 访问：首页侧边栏点击"安全中心"
- 查看举报：在"我的举报"标签页查看
- 查看处罚：在"我的处罚"标签页查看
- 兑换信用分：在信用分区域点击兑换

### 16. 维护模式

**功能特点**:
- 系统维护开关
- 测试密钥生成
- 维护 bypass 机制
- 自动定时维护

**使用方法**:
- 开启维护：管理员在后台开启维护模式
- 测试密钥：生成测试密钥供内部测试

**相关API**:
- `POST /api/admin/maintenance/toggle` - 切换维护模式
- `POST /api/maintenance/verify` - 验证测试密钥

## 🛠️ 技术栈

- **运行时**: Node.js ≥ 18
- **后端**: Express ^4.22
- **数据库**: better-sqlite3 ^11
- **验证码**: slider-captcha ^1.0
- **前端**: 原生 HTML/CSS/JS（无构建步骤）
- **加密**: Node 内置 crypto
- **小程序**: 微信原生小程序

## 📦 安装与运行

### 环境要求
- Node.js ≥ 18

### 安装步骤

1. 克隆项目
```bash
git clone https://github.com/WR1ENCH/campus-wall.git
cd campus-wall
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
```
编辑 `.env` 文件，设置必要的密钥：
- `TOKEN_SECRET` - Token签名密钥（建议设置）
- `CERT_ENC_SECRET` - 实名信息加密密钥（建议设置）
- `SENSITIVE_KEY` - 敏感词库解密密钥（如果使用腾讯词库）

4. 启动服务
```bash
npm start
```

### 访问
- 前台: http://localhost:3000/
- 后台: http://localhost:3000/admin.html（首次访问需创建超级管理员）

## 📁 项目结构

```
campus-wall/
├── server.js                 # 入口文件
├── db.js                     # 数据库操作
├── maintenance.js            # 维护模式
├── zhixue.js                 # 智学网认证
├── sensitiveWords.js         # 敏感词库
├── crypto_words.js           # 加密词库
├── bullyingNames.js          # 霸凌名称库
├── spa.js                    # 前端SPA路由
├── *.html                    # 前端页面
├── pages/                    # SPA页面片段
├── assets/                   # 静态资源
├── lib/                      # 后端公共模块
│   ├── crypto.js             # 加密相关
│   ├── middleware.js         # 中间件
│   ├── state.js              # 内存状态
│   ├── sse.js                # SSE推送
│   └── ...
├── routes/                   # 后端API模块
│   ├── admin.js              # 后台管理
│   ├── auth.js               # 认证
│   ├── user.js               # 用户
│   ├── posts.js              # 帖子
│   └── ...
├── campus-wall-miniprogram/   # 微信小程序
└── data/                     # 数据库文件
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

- GitHub: https://github.com/WR1ENCH/campus-wall
- Gitee: https://gitee.com/wr1Ench/campus-wall

---

*注意：这是一个校园社区项目，请遵守相关法律法规，维护良好的网络环境。*