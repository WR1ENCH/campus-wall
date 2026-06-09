# 校园墙微信小程序

校园墙网页版的微信小程序版本，风格与网页版完全一致。

## 目录结构

```
campus-wall-miniprogram/
├── app.js              # 小程序逻辑
├── app.json            # 小程序配置
├── app.wxss            # 全局样式
├── project.config.json # 项目配置
├── sitemap.json        # sitemap配置
└── pages/
    └── index/          # 首页
        ├── index.js
        ├── index.json
        ├── index.wxml
        └── index.wxss
```

## 背景样式（与网页版一致）

```css
background-color: #c4a882;
background-image:
  repeating-linear-gradient(0deg, ...),  /* 横线 */
  repeating-linear-gradient(90deg, ...), /* 竖线 */
  repeating-linear-gradient(0deg, ...);  /* 木纹纹理 */
background-size: 240px 120px;
```

## 颜色系统

| 颜色 | 用途 | 色值 |
|------|------|------|
| note-yellow | 闲置 | #fff9b1 |
| note-pink | 表白 | #ffc9de |
| note-green | 问答 | #b5f5c5 |
| note-blue | 失物 | #bde0fe |
| note-orange | 拼单 | #ffd6a5 |
| note-purple | 其他 | #d5b8ff |

## 开发说明

1. 使用微信开发者工具打开本目录
2. 修改 `project.config.json` 中的 appid 为你的小程序 appid
3. 后端 API 地址在 `pages/index/index.js` 中修改

## 注意事项

- 微信小程序默认端口 3000 可能被占用，请确保后端服务运行在正确的端口
- 需要在微信开发者工具中开启"不校验合法域名"才能访问本地 API