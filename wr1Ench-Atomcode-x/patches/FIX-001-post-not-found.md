# FIX-001: post.html 查看详情显示"帖子不存在或已被删除"

## 症状

从 index.html 点击帖子"查看详情"跳转到 post.html 后，页面显示"帖子不存在或已被删除"。

## 根因

**双层 bug，三个触发点：**

### Bug A: `db.js` — `tryParse` 无法处理数字字符串 `"0.0"`

数据库中 `posts.comments` 字段是 TEXT 类型，值为 `"0.0"`。

```javascript
// dev 分支的 tryParse:
function tryParse(v) {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '1') return true;
  if (v === '0') return false;
  // ← 缺少数字转换！"0.0" 不匹配任何条件
  return v;  // "0.0" 原样返回
}
```

**结果**: `post.comments = "0.0"` (非空 string, **truthy**)

### Bug B: `server.js` — 多处用 `if (post.comments)` 检查而非 `Array.isArray()`

`"0.0"` 是 truthy，进入代码块：
```javascript
if (post.comments) {                    // "0.0" → true
    post.comments = post.comments.filter(c => !c.deleted);  // TypeError!
}
```

### Bug C: `server.js` — `cleanupOldDeletedData` 启动时崩溃

```javascript
var oldComments = (post.comments || []).filter(...)
// "0.0" || [] → "0.0" (truthy)
// "0.0".filter → TypeError → 服务器崩溃
```

**完整链路**:
1. 服务器启动 → `cleanupOldDeletedData()` 崩溃 → 进程退出
2. 用户访问 post.html → fetch 连接失败 → catch → `showNotFound()`
3. 用户只看到"帖子不存在或已被删除"

## 修复方案

### 1. `db.js` — tryParse 增加数字字符串转换

```javascript
// 在 "0"/"1" 布尔解析之后、JSON 解析之前插入：
if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (isFinite(n)) return Number.isInteger(n) ? n : n;
}
```

这样 `"0.0"` → `0` (number)，`"0"` → `0` 而非 `false`。

### 2. `server.js` — 所有 post.comments 操作改用 Array.isArray 守卫

所有 `post.comments.filter(...)` 和 `(post.comments || []).filter(...)` 均改为 `(Array.isArray(post.comments) ? post.comments : []).filter(...)`。

## 验证

1. ✅ 服务器启动无崩溃
2. ✅ `curl http://localhost:3000/api/posts/:id` 返回 `{"ok":true,"data":{"comments":[],...}}`
3. ✅ 浏览器中点击 index.html → post.html 正常显示帖子

## 受影响文件

| 文件 | 改动 |
|------|------|
| `db.js:89-92` | tryParse 增加数字字符串转换 |
| `server.js:2303-2307` | 单帖路由 `if → Array.isArray` |
| `server.js:2682` | 用户删评论 `Array.isArray` 守卫 |
| `server.js:2718` | 管理员删评论 `Array.isArray` 守卫 |
| `server.js:2745` | 批量删评论 `Array.isArray` 守卫 |
| `server.js:3599` | 启动清理 `Array.isArray` 守卫 |
| `server.js:3613` | 启动清理过滤 `Array.isArray` 守卫 |
