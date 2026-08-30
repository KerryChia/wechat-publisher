# 微信公众号 HTML 排版规范（speedref）

`publish.ts` 的渲染器（`render.ts`）已按此规范产出合规 HTML。改主题时务必遵守。

## 核心原则

微信编辑器有白名单过滤机制。**所有样式必须写成元素的 `style` 内联属性。**

- `<style>` 标签、`<link>` 外部样式表、`class` 选择器、`id` 选择器 —— 全部失效。
- 不能用任何 JavaScript（`<script>` 被剔除）。

## 标签支持

- ✅ `<p> <h1>~<h6> <strong> <b> <em> <i> <u> <span> <br> <ul> <ol> <li> <div> <section> <a> <img> <table> <tr> <td> <th> <blockquote> <pre> <code> <hr>`，以及保守的**静态内联** `<svg>`。
- ❌ `<script> <iframe> <object> <embed> <form> <input>`；文章 fragment 内也不要保留预览壳用的 `class`、`id` 或事件属性。

## CSS 属性

- ✅ `font-size color font-weight font-style line-height letter-spacing text-align text-decoration text-indent margin padding width height max-width background background-color border border-radius box-shadow opacity display(block/inline-block) vertical-align overflow`
- ❌ `position`（连同 `z-index` 一起失效）、`@media`、`@keyframes`/`animation`、`transform`（不稳定）。`float` 在折叠长图文里有坑。

## 图片

### 浏览器复制到编辑器

- 复制前必须克隆正文；合理且 ≤1 MB 的图片 data URI 保留，其他可抓取图片转为 data URI，原 DOM 不变。
- 必须在点击同步调用栈内用 `Promise<Blob>` 构造 ClipboardItem 并调用 `navigator.clipboard.write`，之后并发处理图片；单图抓取超时为 8 秒。
- 抓取、CORS、HTTP、超时、格式或大小失败时，仅将克隆里的 `<img>` 换为纯内联 `<span style="display:block">` 占位符，保留外层 frame/caption。占位符使用虚线边框、圆角、浅色背景和稳定高度，提示“图片待替换”“选中本框内文字后直接粘贴原图”。
- 占位符禁止输出 `alt`、`src`、URL、查询参数、请求错误或其他图片元信息。
- Clipboard API/ClipboardItem 同步不可用时立即走同步 fallback，不发起抓图：保留已有合规 data URI，其他图片直接占位。异步 write 拒绝后可再尽力 fallback。
- Clipboard API 必须同时写富文本 `text/html` 与真实 `text/plain`。`execCommand('copy')` fallback 只能复制 clone 的子节点，不得复制带 `article-content` / `wx-article-inner` ID 或壳样式的根容器；任何路径都不得误报成功。

### API 上传

- API 最终正文 `<img>` 的 `src` 必须是微信域名 URL（`mmbiz.qpic.cn`）。`publish.ts` 自动把本地文件 / 远程 URL / base64 调 `media/uploadimg` 上传并替换 `src`。
- `media/uploadimg` 限制：单张 ≤1MB，jpg/png/gif。封面走 `material/add_material`，≤10MB。
- API 上传继续 fail-fast：图片不可读、下载失败、超限、格式不支持或微信上传失败时必须终止，不得插入浏览器占位符后继续创建或更新草稿。

## 排版数值（内置默认主题）

- 正文 15px / 行高 1.8 / 字间距 0.5px / 颜色 `#3f3f3f`
- 大标题 H1 20px/800、小标题 H2 16px/700（左侧绿色色条）、H3 15px/700
- 辅助文字（引用块 / 表格 / 代码）13px
- 所有文字块段前段后距 8px
- 主题色 `#07c160`（微信绿）

## SVG 互动（本 skill 暂不含）

公众号互动靠 SVG SMIL 动画（`<animate>` `<animateTransform>`，`begin="click"`）。
draft/add 接口会过滤掉 SVG 动画 —— 互动效果只能走「浏览器注入编辑器」路线，无法走 API。属于后续版本。
