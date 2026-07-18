# 发帖窗口重设计

## 概述
将 index.html 中现有的黄色便利贴发帖弹窗改为白色底、从下往上滑入（Bottom Sheet）的现代化扁平设计。便利贴卡片仅保留在文字输入框区域，其余功能选项在白色面板上。

## 设计参数
- DESIGN_VARIANCE: 6 / MOTION_INTENSITY: 5 / VISUAL_DENSITY: 3
- 风格：扁平、白色底、现代化、无 emoji（SVG 图标）

## 布局结构
1. 遮罩层：半透明黑色 + `backdrop-filter: blur(4px)`
2. Bottom Sheet 容器：白色底，圆角 20px，`transform: translateY(100%) → translateY(0)` spring 入场
3. 内容从上到下：
   - 顶部栏：标题「写便利贴」+ 关闭按钮（X 图标 SVG）
   - 便利贴卡片：暖黄色，胶带装饰，微旋转，不占满宽度（85%），仅包裹 textarea
   - 类型标签：在便利贴外部白色区域
   - 图片上传区：在白色区域
   - 匿名/更多选项：checkbox 在白色区域
   - 底部操作栏：取消 + 贴上去 按钮

## 功能保留
- `submitNote()`、`createPost()`、`selectTag()`、`addPostImage()`、`removePostImage()`、`renderPostImages()`
- `togglePostOptions()`、`openNoteDetail()`、`closeModal()`
- 所有敏感词/霸凌检测回调
- 字数统计、#话题自动补全

## z-index 策略
- Bottom Sheet 容器：`z-index: 10000`
- 敏感词/霸凌弹窗：保持 `z-index: 10001`（始终在发帖窗之上）

## 修改文件
- `index.html`（CSS + HTML + JS，仅修改发帖弹窗相关部分）

## 不修改的文件
- `post.html`、`notice.html`、`routes/posts.js`（后端不变）
