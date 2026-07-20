## AGENT职责
认真阅读本文件的Diff部分，调用ponytail插件,superpower插件以及所有代码审查skills，认真审查这些代码


你必须交付：

1) 按严重程度排序的风险清单。

2) 决策没覆盖到的测试点和边界条件。

3) 基于 diff 的逐项审查结论。

4) 最低成本的补救建议。

你的判断必须基于：

- diff

- 实际执行结果

- 测试覆盖情况

- 已知约束条件
## AGENT原则
你不负责写实现，你只负责审查和验收

禁止事项：

- 凭感觉输出

- 在没有验证结果时宣称"应该没问题"

- 越过风险直接建议合并

# 目标
## 在user.html中加入合适的MBTI测验入口
进入测验入口则弹出测验出窗口

## 在user.html中加入MBTI测验窗口
窗口要求简约大气现代化扁平，请给出几种设计方案让我选择
窗口要自动保存测验进度，当用户测到一半关闭窗口后如果再次打开窗口，那么先弹窗是否继续或者重新凯撒
所有的弹窗及其内部动作都要有着流畅的动画，同时加入流畅丝滑的测验进度条

完成测验后的MBTI属性写入数据库，user.html不再显示测验入口

有关MBTI测验内容请你联网查询，参考https://github.com/MoonlightAFar/MBTI_Test

## 在user.html中加入MBTI属性显示
建议的显示位置是在user.html中PLUS++标识附近

需要你好好设计标识样式

## 帖子卡片加入显示‘我是I人’或‘我是E人'标识

其中’I人‘和’E人‘参考用户的MBTI测验结果，如果没有，则显示
要求自行设计标识，要求标识简约现代而且有点Q版

分别在Index.html中点击帖子卡片弹出的帖子弹窗和所对应的post.html中的帖子卡片中显示



# MBTI Integration - Diff 2026年 07月 20日 星期一 17:28:08 CST

diff --git a/db.js b/db.js
index 19edaad..09d8dd9 100644
--- a/db.js
+++ b/db.js
@@ -458,7 +458,7 @@ function migrate() {
     { name: 'posts', columns: ['type', 'likes', 'images', 'discussionId', 'likedBy', 'comments', 'commentsCount', 'liked', 'rotate', 'zIndex', 'isAnonymous', 'visibility', 'allowComments', 'visibleTo', 'invisibleTo'] },
     { name: 'votes', columns: ['allowCustom'] },
     // ponytail: 已有库补齐智学/认证字段（与 CREATE TABLE 声明保持一致）
-    { name: 'users', columns: ['zhixueCertType', 'zhixueUsername', 'zhixuePassword', 'zhixueManualName', 'zhixueManualEmail', 'zhixueManualNote', 'zhixueManualImages', 'zhixueSubmittedAt', 'zhixueRejectReason', 'zhixueRejectedAt', 'zhixueConfirmedAt', 'certRealName', 'certClassName', 'bullyingProtection'] },
+    { name: 'users', columns: ['zhixueCertType', 'zhixueUsername', 'zhixuePassword', 'zhixueManualName', 'zhixueManualEmail', 'zhixueManualNote', 'zhixueManualImages', 'zhixueSubmittedAt', 'zhixueRejectReason', 'zhixueRejectedAt', 'zhixueConfirmedAt', 'certRealName', 'certClassName', 'bullyingProtection', 'mbti'] },
     // 新版举报：唯一举报ID(REPO-)、处理结果、关联处罚ID、证据快照
     { name: 'reports', columns: ['reportId', 'handledResult', 'punishmentId', 'evidenceContent', 'reportedUserId'] },
     { name: 'discussions', columns: ['official'] },
diff --git a/docs_for_agent.md b/docs_for_agent.md
index 6c7242a..4b228fb 100644
--- a/docs_for_agent.md
+++ b/docs_for_agent.md
@@ -738,6 +738,22 @@ admin → auth → user → posts → discussions → qa → votes → notices
 | POST | `/api/slider-captcha/grant` | 无 | 滑块验证通过，下发 captcha 会话 token |
 | POST | `/api/page-visit` | 用户(可选) | 全量页面访问记录（Session 16），记录 IP/UA 到 `login_logs`，`type:'page_visit'` |
 
+### 5.19 MBTI 性格测试集成
+
+| 文件 | 类型 | 说明 |
+|------|------|------|
+| `db.js` | 修改 | `users` 表迁移列追加 `mbti` |
+| `routes/user.js` | 修改 | `PATCH /api/user/me` 接收 `mbti`（格式校验 `/^[EISNTFJP]{4}$/`）；`GET /api/user/me` 和 `GET /api/users/:id` 返回 `mbti` |
+| `routes/posts.js` | 修改 | 帖子 enrichment 加 `authorMbti` 字段（仅暴露首字母 I/E，不暴露完整类型） |
+| `mbti-questions.js` | **新建** | 30 题 MBTI 题库，`window.MBTI_QUESTIONS` 全局变量，每维度分布：E/I×8、S/N×7、T/F×7、J/P×8 |
+| `user.html` | 修改 | 测验入口按钮、30 题弹窗（进度条/选项卡片/计分）、结果弹窗（16 人格中文名 + 维度柱状图）、昵称行 MBTI 标签（完整类型 + I/E 药丸） |
+| `index.html` | 修改 | 帖子卡片 author 区加 I/E 药丸（`<span class="mbti-pill mbti-i/e">`） |
+| `post.html` | 修改 | 帖子详情 badges 区加 I/E 药丸 |
+
+**前后端数据流：** 前端 30 题 → `calcMbti()` 四维度计票 → `PATCH /api/user/me {mbti:"INTJ"}` → DB 存储 → `GET /api/posts` enrichment 提取首字母 I/E → 前端 `<span class="mbti-pill">` 渲染。
+
+**约束：** 仅暴露 MBTI 首字母（I/E）在帖子中，不公开完整类型；已测验用户不可重复测验；零新依赖。
+
 ---
 
 ## 6. 前端架构（SPA）
diff --git a/index.html b/index.html
index e176e08..71e168d 100644
--- a/index.html
+++ b/index.html
@@ -2951,8 +2951,9 @@ backdrop-filter: blur(4px);
  <span id="detailAuthor"></span>
  </a>
   <span id="detailAdminBadge" style="display:none; margin:0 4px;"></span>
-  <span id="detailPlusBadge" style="display:none; margin:0 4px;"></span>
-  <span id="detailCertBadge" style="display:none; margin:0 4px;"></span>
+   <span id="detailPlusBadge" style="display:none; margin:0 4px;"></span>
+   <span id="detailMbtiBadge" style="display:none; margin:0 4px;"></span>
+   <span id="detailCertBadge" style="display:none; margin:0 4px;"></span>
  <span class="note-time" id="detailTime"></span>
  </div>
  <div class="detail-btn-group">
@@ -5849,7 +5850,7 @@ async function showPostCaptchaModal() {
  ${post.avatar && post.avatar.startsWith('data:') ? `<img src="${escHtml(post.avatar)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;" onerror="this.style.display='none'">` : `<span style="font-size:16px;">${post.avatar && post.avatar.length <= 4 ? post.avatar : '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'}</span>`}
  ${post.userId && !post.isAnonymous ? '</a>' : ''}
   ${post.userId && !post.isAnonymous ? `<a href="user.html?id=${post.userId}" style="text-decoration:none; color:inherit;">` : ''}
-  <span>${post.author}</span>${post.authorAdminRole === 'super' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/></svg> 超管认证' : post.authorAdminRole === 'admin' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg> 普管认证' : ''}  ${post.authorIsPlus ? '<span class="plus-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>' : ''}
+   <span>${post.author}</span>${post.authorAdminRole === 'super' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/></svg> 超管认证' : post.authorAdminRole === 'admin' ? '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg> 普管认证' : ''}  ${post.authorIsPlus ? '<span class="plus-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>' : ''}${post.authorMbti ? '<span class="mbti-pill mbti-' + post.authorMbti.toLowerCase() + '">' + post.authorMbti + '人</span>' : ''}
   ${post.userId && !post.isAnonymous ? '</a>' : ''}
   <span class="note-time">· ${post.time}</span>
  </div>
@@ -6227,6 +6228,17 @@ async function showPostCaptchaModal() {
     plusBadge.style.display = 'none';
   }
 
+  // MBTI 标识
+  const detailMbtiBadge = document.getElementById('detailMbtiBadge');
+  if (detailMbtiBadge) {
+    if (post.authorMbti) {
+      detailMbtiBadge.innerHTML = '<span class="mbti-pill mbti-' + post.authorMbti.toLowerCase() + '">' + post.authorMbti + '人</span>';
+      detailMbtiBadge.style.display = '';
+    } else {
+      detailMbtiBadge.style.display = 'none';
+    }
+  }
+
   // 同学认证标识
   const certBadge = document.getElementById('detailCertBadge');
  if (post.authorZhixueStatus === 'approved') {
@@ -9604,6 +9616,7 @@ textarea.form-input{resize:vertical;min-height:80px;line-height:1.5;}
 .whisper-modal-overlay{background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);}
 .whisper-incoming-modal{animation:fadeSlideIn 0.25s ease-out;}
 @keyframes fadeSlideIn{from{opacity:0;transform:translateY(-12px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
+.mbti-pill{display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;padding:0 5px;border-radius:8px;vertical-align:middle;line-height:16px;margin:0 2px;}.mbti-pill.mbti-i{color:#2e7d32;background:rgba(46,125,50,0.15);border:1px solid rgba(46,125,50,0.25);}.mbti-pill.mbti-e{color:#e65100;background:rgba(230,81,0,0.12);border:1px solid rgba(230,81,0,0.2);}
 </style>
 <script>var _punishShown=false;var ML={whisper:'悄悄话',anonymous_post:'匿名发帖/拍卖',qa:'你问我答',post:'发帖/参与讨论',vote:'投票区'};window.checkPunishment=async function(){if(_punishShown)return;try{var t=localStorage.getItem('campus_user_token');if(!t)return;var r=await fetch('/api/user/safety-center',{headers:{'x-user-token':t}});var j=await r.json();if(j.ok&&j.data&&j.data.activePunishment){var p=j.data.activePunishment;var measures=p.level==='T0'?'所有交互功能':(Array.isArray(p.measures)?p.measures.map(function(m){return ML[m]||m;}).join('、'):'-');var desc='你因「'+escHtml(p.reason)+'」被处罚，限制功能：'+measures+'，时长：'+(p.durationDays>0?p.durationDays+'天':'永久')+'。';document.getElementById('punishPopupDesc').textContent=desc;_punishShown=true;setTimeout(function(){document.getElementById('punishPopup').classList.add('open');},500);var pb=document.getElementById('punishBanner');if(pb)pb.style.display='flex';adjustTopBar();}}catch(e){}}</script>
 <script src="slider-captcha/longbow.slidercaptcha.min.js"></script>
diff --git a/mbti-questions.js b/mbti-questions.js
new file mode 100644
index 0000000..2920129
--- /dev/null
+++ b/mbti-questions.js
@@ -0,0 +1,32 @@
+window.MBTI_QUESTIONS = [
+  { q: '周末你更愿意怎么过？', a: { text: '和朋友出去聚会、逛街或参加活动', value: 'E' }, b: { text: '一个人宅家看书、看电影或做自己喜欢的事', value: 'I' } },
+  { q: '在团队讨论中，你通常是？', a: { text: '率先发言，积极表达自己的想法', value: 'E' }, b: { text: '先听别人说，想好了再发言', value: 'I' } },
+  { q: '到一个新环境时，你会？', a: { text: '主动和周围的人聊天认识新朋友', value: 'E' }, b: { text: '先观察环境，等人来跟你说话', value: 'I' } },
+  { q: '你更喜欢哪种沟通方式？', a: { text: '面对面聊天，喜欢即时交流的感觉', value: 'E' }, b: { text: '发消息或邮件，可以有时间思考措辞', value: 'I' } },
+  { q: '你的社交圈子是怎样的？', a: { text: '朋友很多但联系不一定都很深', value: 'E' }, b: { text: '只有少数几个知心好友但关系很铁', value: 'I' } },
+  { q: '参加派对或集体活动后你感觉？', a: { text: '充满能量，玩得越久越开心', value: 'E' }, b: { text: '有点累，需要一个人静静恢复能量', value: 'I' } },
+  { q: '你在学校更愿意怎么学习？', a: { text: '和同学一起讨论、互相督促', value: 'E' }, b: { text: '自己一个人专注地学效率更高', value: 'I' } },
+  { q: '放假时你更倾向于？', a: { text: '约朋友出去玩或参加各种活动', value: 'E' }, b: { text: '在家享受独处时光', value: 'I' } },
+  { q: '你更关注事物的哪个方面？', a: { text: '具体的事实、细节和实际用途', value: 'S' }, b: { text: '整体的概念、可能性和背后的意义', value: 'N' } },
+  { q: '阅读或听讲时，你更喜欢？', a: { text: '具体的例子和真实的故事', value: 'S' }, b: { text: '抽象的理论和宏大的构想', value: 'N' } },
+  { q: '看到一段描述时，你更容易记住？', a: { text: '其中具体的事件和数据', value: 'S' }, b: { text: '它带给你的整体感受和联想', value: 'N' } },
+  { q: '你更喜欢讨论什么样的话题？', a: { text: '实际的、当下正在发生的事情', value: 'S' }, b: { text: '未来的可能性、假设性的问题', value: 'N' } },
+  { q: '你觉得自己是一个？', a: { text: '脚踏实地、注重实际的人', value: 'S' }, b: { text: '富有想象力、爱做白日梦的人', value: 'N' } },
+  { q: '做手工或拼图时，你更享受？', a: { text: '一步步按照说明完成的过程', value: 'S' }, b: { text: '自己摸索创新出不同的玩法', value: 'N' } },
+  { q: '你更倾向于什么类型的兴趣爱好？', a: { text: '烹饪、运动、手工等动手类', value: 'S' }, b: { text: '哲学、科幻、艺术创作等抽象类', value: 'N' } },
+  { q: '做决定时，你更依赖？', a: { text: '逻辑分析和客观事实', value: 'T' }, b: { text: '个人感受和对他人的影响', value: 'F' } },
+  { q: '朋友向你倾诉烦恼时，你通常会？', a: { text: '帮他分析问题，给出解决方案', value: 'T' }, b: { text: '先安慰他的情绪，表示理解', value: 'F' } },
+  { q: '你认为公平更重要还是体谅更重要？', a: { text: '公平公正，每个人都该一视同仁', value: 'T' }, b: { text: '体谅他人，特殊情况可以特殊处理', value: 'F' } },
+  { q: '你更在意别人说什么还是怎么说？', a: { text: '更在意说话的内容是否合理', value: 'T' }, b: { text: '更在意说话的态度是否友善', value: 'F' } },
+  { q: '考试考砸了，你的第一反应是？', a: { text: '分析哪里错了，下次避免', value: 'T' }, b: { text: '好难过，需要人安慰一下', value: 'F' } },
+  { q: '面对一个社会热点事件，你更关注？', a: { text: '事件的原因和逻辑链条', value: 'T' }, b: { text: '事件中人们的感受和遭遇', value: 'F' } },
+  { q: '别人指出你的缺点时，你会？', a: { text: '先看他说得有没有道理', value: 'T' }, b: { text: '先感觉有点受伤', value: 'F' } },
+  { q: '你更喜欢哪种生活方式？', a: { text: '有明确的计划和安排，按表做事', value: 'J' }, b: { text: '随机应变，保持灵活', value: 'P' } },
+  { q: '你的书桌/房间通常是？', a: { text: '整洁有序，每样东西都有固定位置', value: 'J' }, b: { text: '有点乱但我自己找得到东西', value: 'P' } },
+  { q: '面对截止日期，你通常会？', a: { text: '提前计划，尽早完成', value: 'J' }, b: { text: '到最后时刻才有动力赶工', value: 'P' } },
+  { q: '你更喜欢什么样的学习计划？', a: { text: '制定详细的计划表然后严格执行', value: 'J' }, b: { text: '想学什么学什么，随性而为', value: 'P' } },
+  { q: '做决定时你更喜欢？', a: { text: '尽快做出决定，不喜欢悬而未决', value: 'J' }, b: { text: '保留选择权，想多看看再做决定', value: 'P' } },
+  { q: '你的做事风格是？', a: { text: '做完一件事再做下一件', value: 'J' }, b: { text: '同时做好几件事，换来换去', value: 'P' } },
+  { q: '你更喜欢什么样的旅行？', a: { text: '提前订好酒店和行程的攻略旅行', value: 'J' }, b: { text: '说走就走，走到哪玩到哪', value: 'P' } },
+  { q: '你的日常习惯是？', a: { text: '每天作息规律，按点吃饭睡觉', value: 'J' }, b: { text: '随心情而定，不固定作息', value: 'P' } },
+];
diff --git a/post.html b/post.html
index 83a4b6a..31cfcf8 100644
--- a/post.html
+++ b/post.html
@@ -958,6 +958,7 @@
         transition-duration: 0.01ms !important;
       }
     }
+    .mbti-pill{display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;padding:0 5px;border-radius:8px;vertical-align:middle;line-height:16px;margin:0 2px;}.mbti-pill.mbti-i{color:#2e7d32;background:rgba(46,125,50,0.15);border:1px solid rgba(46,125,50,0.25);}.mbti-pill.mbti-e{color:#e65100;background:rgba(230,81,0,0.12);border:1px solid rgba(230,81,0,0.2);}
   </style>
 </head>
 <body>
@@ -1209,6 +1210,9 @@
     if (post.authorIsPlus) {
       badges += '<span class="plus-cert-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>PLUS++</span>';
     }
+    if (post.authorMbti) {
+      badges += '<span class="mbti-pill mbti-' + post.authorMbti.toLowerCase() + '">' + post.authorMbti + '人</span>';
+    }
     if (post.authorZhixueStatus === 'approved') {
       badges += '<span class="verify-badge">' + (post.authorZhixueCertType === 'manual' ? '已实名' : '已认证') + '</span>';
     }
diff --git a/routes/posts.js b/routes/posts.js
index 196f2a4..4963ae3 100644
--- a/routes/posts.js
+++ b/routes/posts.js
@@ -141,6 +141,7 @@ app.get('/api/posts', (req, res) => {
             adminId = author.bindAdminId;
           }
         }
+        const authorMbtiFirst = author.mbti ? (author.mbti.charAt(0) === 'I' || author.mbti.charAt(0) === 'E' ? author.mbti.charAt(0) : null) : null;
         const enriched = {
           ...p,
           likes: Number(p.likes) || 0,
@@ -149,7 +150,8 @@ app.get('/api/posts', (req, res) => {
           authorBindAdminId: adminId,
           authorIsPlus: plusUserIds.has(author.id),
           authorZhixueStatus: zhixueStatus,
-          authorZhixueCertType: author.zhixueCertType || null
+          authorZhixueCertType: author.zhixueCertType || null,
+          authorMbti: authorMbtiFirst
         };
         if (p.isAnonymous) enriched.userId = undefined;
         return enriched;
@@ -231,7 +233,8 @@ app.get('/api/posts/:id', (req, res) => {
       if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
         zhixueStatus = null;
       }
-      const detail = { ...post, authorIsPlus: isUserPlus(author.id), authorZhixueStatus: zhixueStatus, authorZhixueCertType: author.zhixueCertType || null };
+      const authorMbtiFirst = author.mbti ? (author.mbti.charAt(0) === 'I' || author.mbti.charAt(0) === 'E' ? author.mbti.charAt(0) : null) : null;
+      const detail = { ...post, authorIsPlus: isUserPlus(author.id), authorZhixueStatus: zhixueStatus, authorZhixueCertType: author.zhixueCertType || null, authorMbti: authorMbtiFirst };
       if (post.isAnonymous) detail.userId = undefined;
       return res.json({ ok: true, data: detail });
     }
diff --git a/routes/user.js b/routes/user.js
index 3e832c6..a7b9aac 100644
--- a/routes/user.js
+++ b/routes/user.js
@@ -550,7 +550,7 @@ module.exports = function(app) {
     const user = users.find(u => u.id === session.id);
     if (!user) return res.json({ ok: false, msg: '用户不存在' });
     if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });
-    res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, credit: user.credit || 0, checkinToday: user.lastCheckinDate === new Date().toISOString().slice(0, 10), checkinStreak: user.checkinStreak || 0, zhixueStatus: getDisplayZhixueStatus(user), zhixueUsername: user.zhixueUsername || null } });
+    res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, credit: user.credit || 0, checkinToday: user.lastCheckinDate === new Date().toISOString().slice(0, 10), checkinStreak: user.checkinStreak || 0, zhixueStatus: getDisplayZhixueStatus(user), zhixueUsername: user.zhixueUsername || null, mbti: user.mbti || null } });
   });
   app.get('/api/user/checkin-status', (req, res) => {
     const token = req.headers['x-user-token'];
@@ -706,9 +706,9 @@ module.exports = function(app) {
     const user = users[userIndex];
     if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });
   
-    const { nickname, avatar } = req.body;
+    const { nickname, avatar, mbti } = req.body;
     let updated = false;
-  
+
     // 更新昵称
     if (nickname !== undefined) {
       if (nickname.length < 2 || nickname.length > 12) {
@@ -717,7 +717,7 @@ module.exports = function(app) {
       user.nickname = nickname;
       updated = true;
     }
-  
+
     // 更新头像（base64 data URL）
     if (avatar !== undefined) {
       // 验证头像格式和大小
@@ -745,11 +745,24 @@ module.exports = function(app) {
       user.avatar = avatar;
       updated = true;
     }
-  
+
+    // 更新 MBTI
+    if (mbti !== undefined) {
+      if (mbti === '' || mbti === null) {
+        user.mbti = null;
+        updated = true;
+      } else if (/^[EISNTFJP]{4}$/.test(mbti)) {
+        user.mbti = mbti;
+        updated = true;
+      } else {
+        return res.json({ ok: false, msg: 'MBTI 格式错误，需为 4 位字母组合' });
+      }
+    }
+
     if (!updated) {
       return res.json({ ok: false, msg: '未提供可更新的字段' });
     }
-  
+
     users[userIndex] = user;
     writeUsers(users);
     res.json({ ok: true, data: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
@@ -1071,7 +1084,7 @@ app.get('/api/users/:id', (req, res) => {
   if (!user) return res.json({ ok: false, msg: '用户不存在' });
   if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
   // 不返回密码等敏感信息
-  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, zhixueStatus: getDisplayZhixueStatus(user) } });
+  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, zhixueStatus: getDisplayZhixueStatus(user), mbti: user.mbti || null } });
 });
 
 app.get('/api/users/:id/posts', (req, res) => {
diff --git a/user.html b/user.html
index 3ab96ab..392a4a6 100644
--- a/user.html
+++ b/user.html
@@ -1271,6 +1271,256 @@
       z-index: 99999;
     }
 
+    /* ===== MBTI Test ===== */
+    .mbti-badge-entry {
+      display: inline-flex;
+      align-items: center;
+      gap: 3px;
+      margin-left: 4px;
+      font-size: 10px;
+      font-weight: 700;
+      color: #6b4c9a;
+      background: rgba(107,76,154,0.12);
+      padding: 1px 8px;
+      border-radius: 10px;
+      border: 1px solid rgba(107,76,154,0.2);
+      cursor: pointer;
+      vertical-align: middle;
+      transition: all 0.15s;
+    }
+    .mbti-badge-entry:hover {
+      background: rgba(107,76,154,0.2);
+    }
+    .mbti-badge-done {
+      display: inline-flex;
+      align-items: center;
+      gap: 3px;
+      margin-left: 4px;
+      font-size: 10px;
+      font-weight: 700;
+      padding: 1px 8px;
+      border-radius: 10px;
+      vertical-align: middle;
+    }
+    .mbti-full-type {
+      color: #6b4c9a;
+      background: rgba(107,76,154,0.12);
+      border: 1px solid rgba(107,76,154,0.2);
+    }
+    .mbti-pill {
+      display: inline-flex;
+      align-items: center;
+      justify-content: center;
+      font-size: 9px;
+      font-weight: 700;
+      padding: 0 5px;
+      border-radius: 8px;
+      vertical-align: middle;
+      line-height: 16px;
+      margin: 0 2px;
+    }
+    .mbti-pill.mbti-i {
+      color: #2e7d32;
+      background: rgba(46,125,50,0.15);
+      border: 1px solid rgba(46,125,50,0.25);
+    }
+    .mbti-pill.mbti-e {
+      color: #e65100;
+      background: rgba(230,81,0,0.12);
+      border: 1px solid rgba(230,81,0,0.2);
+    }
+    .mbti-overlay {
+      display: none;
+      position: fixed;
+      top: 0; left: 0; right: 0; bottom: 0;
+      background: rgba(0,0,0,0.45);
+      backdrop-filter: blur(4px);
+      z-index: 100000;
+      align-items: center;
+      justify-content: center;
+      animation: mbtiFadeIn 0.25s cubic-bezier(0.22,1,0.36,1);
+    }
+    .mbti-overlay.show { display: flex; }
+    @keyframes mbtiFadeIn {
+      from { opacity: 0; }
+      to { opacity: 1; }
+    }
+    @keyframes mbtiSlideUp {
+      from { opacity: 0; transform: translateY(30px) scale(0.96); }
+      to { opacity: 1; transform: translateY(0) scale(1); }
+    }
+    .mbti-modal {
+      background: #fff;
+      border-radius: 16px;
+      max-width: 440px;
+      width: calc(100% - 32px);
+      max-height: 85vh;
+      overflow-y: auto;
+      padding: 28px 24px 24px;
+      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
+      animation: mbtiSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);
+    }
+    .mbti-modal-header {
+      display: flex;
+      align-items: center;
+      justify-content: space-between;
+      margin-bottom: 20px;
+    }
+    .mbti-modal-title {
+      font-size: 17px;
+      font-weight: 700;
+      color: #1a1a1a;
+    }
+    .mbti-modal-close {
+      background: none;
+      border: none;
+      cursor: pointer;
+      padding: 4px;
+      color: #999;
+      font-size: 20px;
+      line-height: 1;
+    }
+    .mbti-modal-close:hover { color: #333; }
+    .mbti-progress-bar {
+      height: 4px;
+      background: #eee;
+      border-radius: 2px;
+      margin-bottom: 24px;
+      overflow: hidden;
+    }
+    .mbti-progress-fill {
+      height: 100%;
+      background: linear-gradient(90deg, #9c6ade, #6b4c9a);
+      border-radius: 2px;
+      transition: width 0.35s cubic-bezier(0.22,1,0.36,1);
+    }
+    .mbti-question-count {
+      font-size: 11px;
+      color: #999;
+      margin-bottom: 4px;
+    }
+    .mbti-question-text {
+      font-size: 16px;
+      font-weight: 600;
+      color: #1a1a1a;
+      line-height: 1.5;
+      margin-bottom: 20px;
+    }
+    .mbti-options {
+      display: flex;
+      flex-direction: column;
+      gap: 10px;
+    }
+    .mbti-option {
+      display: flex;
+      align-items: center;
+      gap: 12px;
+      padding: 14px 16px;
+      border: 1.5px solid #e8e8e8;
+      border-radius: 12px;
+      cursor: pointer;
+      transition: all 0.18s ease;
+      background: #fafafa;
+      text-align: left;
+    }
+    .mbti-option:hover {
+      border-color: #9c6ade;
+      background: #f5f0ff;
+    }
+    .mbti-option:active {
+      transform: scale(0.98);
+    }
+    .mbti-option-dot {
+      width: 18px;
+      height: 18px;
+      border-radius: 50%;
+      border: 2px solid #ccc;
+      flex-shrink: 0;
+      transition: all 0.18s;
+    }
+    .mbti-option:hover .mbti-option-dot {
+      border-color: #9c6ade;
+    }
+    .mbti-option-text {
+      font-size: 14px;
+      color: #333;
+      line-height: 1.4;
+    }
+    .mbti-result-icon {
+      font-size: 48px;
+      text-align: center;
+      margin-bottom: 12px;
+    }
+    .mbti-result-type {
+      font-size: 32px;
+      font-weight: 800;
+      text-align: center;
+      color: #6b4c9a;
+      margin-bottom: 4px;
+    }
+    .mbti-result-label {
+      font-size: 16px;
+      text-align: center;
+      color: #666;
+      margin-bottom: 20px;
+    }
+    .mbti-result-dims {
+      display: grid;
+      grid-template-columns: 1fr 1fr;
+      gap: 8px;
+      margin-bottom: 20px;
+    }
+    .mbti-dim-bar {
+      display: flex;
+      align-items: center;
+      justify-content: space-between;
+      gap: 6px;
+      font-size: 12px;
+      padding: 6px 10px;
+      background: #f5f5f5;
+      border-radius: 8px;
+    }
+    .mbti-dim-bar .dim-letter {
+      font-weight: 700;
+      color: #6b4c9a;
+    }
+    .mbti-dim-bar .dim-count {
+      color: #999;
+    }
+    .mbti-result-actions {
+      display: flex;
+      gap: 10px;
+      justify-content: center;
+    }
+    .mbti-btn {
+      padding: 10px 24px;
+      border: none;
+      border-radius: 999px;
+      font-size: 14px;
+      font-weight: 600;
+      cursor: pointer;
+      font-family: inherit;
+      transition: all 0.15s;
+    }
+    .mbti-btn-primary {
+      background: #6b4c9a;
+      color: #fff;
+    }
+    .mbti-btn-primary:hover {
+      background: #5a3d85;
+    }
+    .mbti-btn-outline {
+      background: transparent;
+      border: 1.5px solid #6b4c9a;
+      color: #6b4c9a;
+    }
+    .mbti-btn-outline:hover {
+      background: #f5f0ff;
+    }
+    @media (prefers-reduced-motion: reduce) {
+      .mbti-overlay, .mbti-modal, .mbti-progress-fill, .mbti-option { animation: none !important; transition: none !important; }
+    }
+
     /* ===== Responsive ===== */
     @media (max-width: 768px) {
       .container {
@@ -1362,6 +1612,7 @@
             <span class="profile-name" id="userNickname">加载中...</span>
             <span id="adminBadge" style="display:none;"></span>
             <span id="plusBadge" style="display:none;margin-left:4px;font-size:10px;font-weight:700;color:#5a3d00;background:rgba(245,197,24,0.2);padding:1px 8px;border-radius:10px;border:1px solid rgba(245,197,24,0.3);vertical-align:middle;">⭐PLUS++</span>
+            <span id="mbtiBadge" style="display:none;"></span>
           </div>
           <div class="profile-meta">
             <span id="userUsername">@--</span>
@@ -1397,6 +1648,10 @@
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
               <span id="plusBtnLabel">加入PLUS++</span>
             </button>
+            <button id="mbtiBtn" class="btn btn-plus" onclick="openMbtiTest()" style="display:none;border-color:rgba(107,76,154,0.3);color:#6b4c9a;">
+              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
+              <span id="mbtiBtnLabel">MBTI性格测试</span>
+            </button>
           </div>
           </div>
         </div>
@@ -1554,6 +1809,49 @@
     </div>
   </div>
 
+  <!-- ===== MBTI Test Modal ===== -->
+  <div class="mbti-overlay" id="mbtiModalOverlay">
+    <div class="mbti-modal">
+      <div class="mbti-modal-header">
+        <span class="mbti-modal-title">MBTI 性格测试</span>
+        <button class="mbti-modal-close" onclick="closeMbtiModal()">✕</button>
+      </div>
+      <div class="mbti-progress-bar"><div class="mbti-progress-fill" id="mbtiProgressFill" style="width:0%"></div></div>
+      <div class="mbti-question-count" id="mbtiQuestionCount">1 / 30</div>
+      <div class="mbti-question-text" id="mbtiQuestionText"></div>
+      <div class="mbti-options" id="mbtiOptions"></div>
+    </div>
+  </div>
+
+  <!-- ===== MBTI Resume Modal ===== -->
+  <div class="mbti-overlay" id="mbtiResumeOverlay">
+    <div class="mbti-modal" style="text-align:center;">
+      <div class="mbti-modal-header" style="justify-content:center;">
+        <span class="mbti-modal-title">继续测试？</span>
+      </div>
+      <p style="font-size:14px;color:#666;margin-bottom:20px;line-height:1.5;">
+        你上次做到了第 <strong id="mbtiResumeCount">0</strong> 题<br>是否继续完成测试？
+      </p>
+      <div class="mbti-result-actions">
+        <button class="mbti-btn mbti-btn-primary" onclick="resumeMbti()">继续答题</button>
+        <button class="mbti-btn mbti-btn-outline" onclick="restartMbti()">重新开始</button>
+      </div>
+    </div>
+  </div>
+
+  <!-- ===== MBTI Result Modal ===== -->
+  <div class="mbti-overlay" id="mbtiResultOverlay">
+    <div class="mbti-modal">
+      <div class="mbti-result-icon" id="mbtiResultIcon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b4c9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.3 3-3.4 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 17v3"/><path d="M15 17v3"/><path d="M9 22h6"/></svg></div>
+      <div class="mbti-result-type" id="mbtiResultType"></div>
+      <div class="mbti-result-label" id="mbtiResultLabel"></div>
+      <div class="mbti-result-dims" id="mbtiResultDims"></div>
+      <div class="mbti-result-actions">
+        <button class="mbti-btn mbti-btn-primary" onclick="closeMbtiResult()">知道了</button>
+      </div>
+    </div>
+  </div>
+
   <!-- ===== Slider Captcha Overlay ===== -->
   <div class="modal-overlay" id="sliderCaptchaOverlay" style="display:none;animation:sliderFadeIn 0.25s ease;z-index:99999;">
     <div class="modal" style="max-width:380px;text-align:center;">
@@ -1567,6 +1865,7 @@
     </div>
   </div>
 
+  <script src="mbti-questions.js"></script>
   <script>
     const urlParams = new URLSearchParams(window.location.search);
     const userId = urlParams.get('id');
@@ -1666,6 +1965,14 @@
         }
       }
 
+      var mbtiBtn = document.getElementById('mbtiBtn');
+      if (mbtiBtn) {
+        var _isSelfMbti = currentLoggedInUser && currentLoggedInUser.id === userId;
+        if (_isSelfMbti) {
+          mbtiBtn.style.display = 'inline-flex';
+        }
+      }
+
       const uidEl = document.getElementById('profileUid');
       if (uidEl) {
         uidEl.querySelector('span').textContent = 'UID: ' + user.id;
@@ -1679,6 +1986,8 @@
           creditInline.textContent = (user.credit || 0);
         }
       }
+
+      updateMbtiBadge(user.mbti);
     }
 
     function calculateStats(posts) {
@@ -1695,6 +2004,160 @@
       document.getElementById('commentCount').textContent = totalComments;
     }
 
+    // ===== Toast =====
+    var toastTimer = null;
+    function showToast(msg) {
+      var t = document.getElementById('mbtiToast');
+      if (!t) {
+        t = document.createElement('div');
+        t.id = 'mbtiToast';
+        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;z-index:200000;opacity:0;transition:opacity 0.3s;pointer-events:none;';
+        document.body.appendChild(t);
+      }
+      t.textContent = msg;
+      t.style.opacity = '1';
+      clearTimeout(toastTimer);
+      toastTimer = setTimeout(function(){ t.style.opacity = '0'; }, 2500);
+    }
+
+    // ===== MBTI =====
+    function getMbtiLabel(type) {
+      var map = {
+        INTJ:'建筑师型人格', INTP:'逻辑学家型人格', ENTJ:'指挥官型人格', ENTP:'辩论家型人格',
+        INFJ:'提倡者型人格', INFP:'调停者型人格', ENFJ:'主人公型人格', ENFP:'竞选者型人格',
+        ISTJ:'物流师型人格', ISFJ:'守卫者型人格', ESTJ:'总经理型人格', ESFJ:'执政官型人格',
+        ISTP:'鉴赏家型人格', ISFP:'探险家型人格', ESTP:'企业家型人格', ESFP:'表演者型人格'
+      };
+      return map[type] || '';
+    }
+
+    function getMbtiSvg(type) {
+      if (!type) return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b4c9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.3 3-3.4 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 17v3"/><path d="M15 17v3"/><path d="M9 22h6"/></svg>';
+      var second = type.charAt(1);
+      if (second === 'N') return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b4c9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
+      if (second === 'S') return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b4c9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>';
+      return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b4c9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.3 3-3.4 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 17v3"/><path d="M15 17v3"/><path d="M9 22h6"/></svg>';
+    }
+
+    function calcMbti(answers) {
+      var dims = { E:0, I:0, S:0, N:0, T:0, F:0, J:0, P:0 };
+      answers.forEach(function(v){ if (dims[v] !== undefined) dims[v]++; });
+      var pairs = [
+        [dims.E, dims.I, 'E', 'I'],
+        [dims.S, dims.N, 'S', 'N'],
+        [dims.T, dims.F, 'T', 'F'],
+        [dims.J, dims.P, 'J', 'P']
+      ];
+      return pairs.map(function(p){ return p[0] >= p[1] ? p[2] : p[3]; }).join('');
+    }
+
+    function openMbtiTest() {
+      if (currentLoggedInUser && currentLoggedInUser.mbti) {
+        showToast('你已完成MBTI测试，不可重复测试');
+        return;
+      }
+      var saved = localStorage.getItem('mbti_progress_' + userId);
+      if (saved) {
+        var p = JSON.parse(saved);
+        document.getElementById('mbtiResumeCount').textContent = p.index;
+        document.getElementById('mbtiResumeOverlay').classList.add('show');
+      } else {
+        startMbtiTest(0, []);
+      }
+    }
+
+    function resumeMbti() {
+      document.getElementById('mbtiResumeOverlay').classList.remove('show');
+      var saved = JSON.parse(localStorage.getItem('mbti_progress_' + userId));
+      if (saved) startMbtiTest(saved.index, saved.answers);
+      else startMbtiTest(0, []);
+    }
+
+    function restartMbti() {
+      document.getElementById('mbtiResumeOverlay').classList.remove('show');
+      localStorage.removeItem('mbti_progress_' + userId);
+      startMbtiTest(0, []);
+    }
+
+    var mbtiAnswers = [];
+
+    function startMbtiTest(startIndex, savedAnswers) {
+      mbtiAnswers = savedAnswers.slice();
+      document.getElementById('mbtiModalOverlay').classList.add('show');
+      renderMbtiQuestion(startIndex);
+    }
+
+    function closeMbtiModal() {
+      if (mbtiAnswers.length > 0 && mbtiAnswers.length < 30) {
+        localStorage.setItem('mbti_progress_' + userId, JSON.stringify({ index: mbtiAnswers.length, answers: mbtiAnswers }));
+      }
+      document.getElementById('mbtiModalOverlay').classList.remove('show');
+    }
+
+    function renderMbtiQuestion(index) {
+      if (index >= 30) {
+        finishMbtiTest(mbtiAnswers);
+        return;
+      }
+      var q = window.MBTI_QUESTIONS[index];
+      document.getElementById('mbtiQuestionCount').textContent = (index + 1) + ' / 30';
+      document.getElementById('mbtiProgressFill').style.width = ((index / 30) * 100) + '%';
+      document.getElementById('mbtiQuestionText').textContent = q.q;
+      document.getElementById('mbtiOptions').innerHTML =
+        '<div class="mbti-option" onclick="selectMbtiOption(\'' + q.a.value + '\', ' + index + ')"><div class="mbti-option-dot"></div><div class="mbti-option-text">' + q.a.text + '</div></div>' +
+        '<div class="mbti-option" onclick="selectMbtiOption(\'' + q.b.value + '\', ' + index + ')"><div class="mbti-option-dot"></div><div class="mbti-option-text">' + q.b.text + '</div></div>';
+    }
+
+    function selectMbtiOption(value, index) {
+      mbtiAnswers[index] = value;
+      renderMbtiQuestion(index + 1);
+    }
+
+    function finishMbtiTest(answers) {
+      document.getElementById('mbtiModalOverlay').classList.remove('show');
+      var type = calcMbti(answers);
+      localStorage.removeItem('mbti_progress_' + userId);
+      document.getElementById('mbtiResultIcon').innerHTML = getMbtiSvg(type);
+      document.getElementById('mbtiResultType').textContent = type;
+      document.getElementById('mbtiResultLabel').textContent = getMbtiLabel(type);
+      var dimLetters = ['E/I', 'S/N', 'T/F', 'J/P'];
+      var html = '';
+      for (var i = 0; i < 4; i++) {
+        var parts = dimLetters[i].split('/');
+        var a = answers.filter(function(v){ return v === parts[0]; }).length;
+        var b = answers.filter(function(v){ return v === parts[1]; }).length;
+        var chosen = type.charAt(i);
+        html += '<div class="mbti-dim-bar"><span class="dim-letter">' + (chosen === parts[0] ? '<b>' + parts[0] + '</b>' : parts[0]) + ' ' + a + '</span><span class="dim-count">|</span><span class="dim-letter">' + (chosen === parts[1] ? '<b>' + parts[1] + '</b>' : parts[1]) + ' ' + b + '</span></div>';
+      }
+      document.getElementById('mbtiResultDims').innerHTML = html;
+      document.getElementById('mbtiResultOverlay').classList.add('show');
+      var token = localStorage.getItem('campus_user_token');
+      if (token) {
+        fetch('/api/user/me', { method: 'PATCH', headers: { 'x-user-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ mbti: type }) })
+          .then(function(r){ return r.json(); })
+          .then(function(j){
+            if (j.ok) updateMbtiBadge(type);
+          });
+      }
+    }
+
+    function closeMbtiResult() {
+      document.getElementById('mbtiResultOverlay').classList.remove('show');
+    }
+
+    function updateMbtiBadge(mbti) {
+      var el = document.getElementById('mbtiBadge');
+      if (!el) return;
+      if (mbti && /^[EISNTFJP]{4}$/.test(mbti)) {
+        el.style.display = 'inline-block';
+        var first = mbti.charAt(0);
+        var cn = first === 'I' ? 'I人' : 'E人';
+        el.innerHTML = '<span class="mbti-badge-done mbti-full-type">' + mbti + '</span><span class="mbti-pill mbti-' + first.toLowerCase() + '">' + cn + '</span>';
+      } else {
+        el.style.display = 'none';
+      }
+    }
+
     function renderPosts(posts) {
       const grid = document.getElementById('postsGrid');
       const loading = document.getElementById('postsLoading');
