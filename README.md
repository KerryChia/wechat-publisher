# wechat-publisher

把文章排版成微信公众号合规 HTML，排版完成自动产出封面图生图提示词，并可通过公众号官方 API 上传图片、管理草稿、在用户最后确认后提交正式发布。

> 作者 / Author：**KerryChia**

## 一键接入

把下面这段话发给任意 ZCode / Codex agent，它会自动讲解、安装并配置本 skill：

```
帮我接入这个 skill：https://github.com/KerryChia/wechat-publisher
把它 clone 到 skills 目录，读 SKILL.md 和 README.md 了解它的排版与发布工作流，
需要凭证时引导我填 .env（WECHAT_APP_ID / WECHAT_APP_SECRET），不要猜测或回显 Secret。
装好后告诉我能用哪些命令触发排版、草稿和发布。
```

本仓库是可公开的 skill 源码与脚本；本地请复制 `.env.example` → `.env` 自行填写。详见 [SECURITY.md](SECURITY.md)。

## 从零接入（Onboarding）

第一次接入、不知道 AppID / AppSecret 在哪取、IP 白名单怎么配？skill 内置了从零引导：见 [references/onboarding.md](references/onboarding.md)。它会带你走完「取凭证 → 配白名单 → 填 .env → 验证通」四步，并附认证类型对照和常见卡点速查。

## 两条独立工作流

### 1. 排版：零凭证

组件化手写 HTML 是默认方案：按文章内容选择视觉配方、组件和静态 SVG 信息图，输出可复制到公众号编辑器的移动端预览。无公众号认证、无 API 凭证也可使用。

- 多种内容配方：观点人物、数据分析、案例方法、产品技术、新闻信号。
- 排版交付时自动附一段封面图生图提示词，可粘贴到即梦 / Midjourney / DALL·E 等任意生图模型出封面，零凭证可用；想由脚本直接生成封面图文件再走接入工作流的 `--gen-cover`。
- 组件全部使用微信安全的内联样式。
- 图片可使用真实素材、静态 SVG 或明确标注的占位；不编造图片 URL。
- 浏览器复制会先克隆正文，并在点击同步调用栈内用 `Promise<Blob>` ClipboardItem 发起写入，再并发抓图（单图 8 秒超时）：≤1 MB 的合理图片 data URI 原样保留，其他图片能抓取则转为 data URI；失败时仅把克隆里的 `<img>` 换成不输出 alt/URL 的内联 `<span>` 占位框，外层相框和图注不变。Clipboard API 同步不可用时立即走不抓图 fallback，且不复制带 ID/壳样式的克隆根容器。
- Markdown 仍支持固定主题快速渲染，但定位为临时/低格式要求的兜底方案。

从 `references/article-template.html` 开始，并阅读：

- `references/formatting-workflow.md`
- `references/design-system.md`
- `references/style-recipes.md`
- `references/components.md`

### 2. 接入：草稿与正式发布

对已认证且有接口权限的公众号，脚本保留并扩展官方 API 工作流：

```bash
cd scripts
npm install

# 只做本地检查，不上传、不请求 API
npx tsx publish.ts article.html --check

# 写入草稿箱
npx tsx publish.ts article.html --title "标题" --author "作者" --cover cover.jpg

# 管理草稿
npx tsx publish.ts --list
npx tsx publish.ts --show <media_id>
npx tsx publish.ts --update <media_id> article.html --title "新标题"
npx tsx publish.ts --delete <media_id>

# 正式发布：仅在用户紧接此前给出最终确认后运行
npx tsx publish.ts --publish <media_id> --confirm-publish
```

正式发布不是创建草稿的副作用。提交前必须展示目标标题和草稿 `media_id`，在对话中再获得用户一次明确确认；提交后继续查询状态，不能将“已受理”误报为“已发布”。

复制 `.env.example` 为 `.env`，填写：

| 变量 | 用途 |
|---|---|
| `WECHAT_APP_ID` | 公众号 AppID |
| `WECHAT_APP_SECRET` | 公众号 AppSecret |
| `OPENAI_API_KEY` | 仅 `--gen-cover` 时需要 |

运行机器的公网 IP 必须已加入公众号后台 API 白名单。不要提交或回显 `.env` 内的 Secret。

## 微信格式边界

- 支持 `.html` / `.htm` 组件化 HTML 与 `.md` Markdown；完整 HTML 的可发布正文置于 `ARTICLE HTML START/END` 标记区。
- 正文只使用内联 `style`，不使用 `style` 标签、class、id、脚本、定位布局、动画或互动 SVG。
- 静态内联 SVG 可用于图表；API 正文图片单张 ≤1 MB（jpg/png/gif），封面 ≤10 MB。
- 浏览器复制的图片占位是交互式降级，不适用于 API：`publish.ts` 上传正文图片时继续 fail-fast，任何不可读、超限、格式不支持或上传失败都会阻断草稿操作。
- 微信接口权限、内容审核和平台策略可能使草稿创建或正式发布失败；请以 API 返回状态为准。

详细规则见 `references/wechat-html-spec.md`；接入步骤见 `references/integration-workflow.md`。

## 效果示例

用本 skill 排版后发布到公众号的实样：[AI 每日简报 · 7 月 17 日](https://mp.weixin.qq.com/s/FkVIBPVkB0hm_jmXqWEHdQ)
