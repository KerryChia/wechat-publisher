---
name: wechat-publisher
description: 把文章排版成微信公众号合规 HTML，提供多风格组件化精排与 Markdown 快速排版，排版完成自动产出封面图生图提示词；可上传图片、生成封面、管理草稿，并在用户二次明确确认后通过公众号官方 API 正式发布。用于「公众号排版」「微信公众号文章」「发布公众号」「推送到草稿箱」「管理公众号草稿」「自动发布公众号文章」「封面提示词」「封面图提示词」「post to wechat」等请求。
---

# WeChat Publisher

将文章做成微信安全的精排内容，或通过官方 API 管理并发布公众号草稿。**排版**与**接入**是两条独立工作流：没有账号和凭证也能完成高质量排版；只有用户明确要求草稿箱或正式发布时，才进入接入工作流。

## 不变量

- 支持 `.html` / `.htm` 组件化 HTML 与 `.md` Markdown；正式文章优先前者。
- 完整 HTML 的可发布内容仍必须置于 `<!-- ARTICLE HTML START -->` 与 `<!-- ARTICLE HTML END -->` 之间。
- 正文仅使用内联 `style`；不在正文放 `<style>`、`class`、`id`、脚本、动画或定位布局。静态内联 SVG 可用。
- 维持微信限制：API 正文图片单张不超过 1 MB（jpg/png/gif），封面不超过 10 MB；正文 API 投递时会自动上传图片并替换为微信 URL，任一图片无法读取、超限或上传失败时仍 **fail-fast**，不得用占位符悄悄继续。
- 浏览器复制工作流必须先克隆正文，不改预览原文：点击同步调用栈内立即用 `Promise<Blob>` ClipboardItem 发起写入，再并发抓图（单图 8 秒超时）；保留合理且不超过 1 MB 的图片 data URI，其余图片能抓取则转为 data URI，失败时只在克隆中把该 `<img>` 换成不含 alt/URL 的内联 `<span>` 占位符。Clipboard API 同步不可用时立即走不抓图 fallback，且只复制克隆子节点；所有路径真实报告结果。
- 草稿创建**绝不自动正式发布**。正式发布属于对外行为，必须紧接发布前获得用户一次明确肯定确认。

## 选择工作流

| 用户目标 | 读取并执行 |
|---|---|
| 只需排版、生成 HTML、复制到编辑器 | [排版工作流](references/formatting-workflow.md) → 本地预览交付 |
| 第一次接入、不知道 AppID/Secret 在哪取 | [Onboarding 引导](references/onboarding.md)，带用户从零拿到凭证、配 IP 白名单、填 .env |
| 快速将 Markdown 转成可用正文 | `scripts/render.ts`；说明其为固定主题兜底 |
| 上传图片、创建/查看/更新/删除草稿 | [接入工作流](references/integration-workflow.md) |
| 从文章到草稿箱 | 先排版并通过本地预检；获得用户同意后再创建草稿 |
| 正式对外发布 | 先确保草稿存在与内容正确，展示发布摘要，获得**最后一次明确确认**，再运行发布命令并查询状态 |

## 排版工作流

1. 先读 [formatting-workflow.md](references/formatting-workflow.md) 和 [design-system.md](references/design-system.md)。按文章主题、读者和信息结构选择一个视觉配方；不要默认套同一绿色模板。
2. 读 [components.md](references/components.md) 选择恰当组件；需要具体配方时读 [style-recipes.md](references/style-recipes.md)。
3. 从 [article-template.html](references/article-template.html) 复制本地预览壳，在标记区生成仅含微信安全内联 HTML 的文章。
4. 图表/对比/流程优先使用静态 SVG；照片与截图使用真实、可用且有版权依据的来源。不要编造图片 URL。
5. 打开本地文件检查手机宽度的层级、留白、图像与断行；只交付复制预览时无需凭证。复制按钮会异步处理克隆中的图片，并真实反馈“已复制”、待替换图片数或失败；占位后在微信编辑器内按提示粘贴原图。
6. 交付时**自动附上一段封面图生图提示词**，供用户粘贴到生图模型自行生成封面；格式、事实边界与去重规则见 [formatting-workflow.md](references/formatting-workflow.md) 第 5 节。希望 skill 直接生成封面图文件时才走接入工作流的 `--gen-cover`（需 `OPENAI_API_KEY`）。
7. 外部网页 AI 可使用 [wechat-format-prompt.md](prompts/wechat-format-prompt.md)；它的浏览器外壳与文章 fragment 严格分离，生成物必须自带完整复制逻辑，不依赖仓库脚本。

## 接入工作流

- 只在用户要求进入草稿箱/管理草稿时读取 [integration-workflow.md](references/integration-workflow.md)。
- **用户不知道 AppID/AppSecret 在哪取、IP 白名单怎么配时**，先读 [onboarding.md](references/onboarding.md) 走从零引导，再回到这里。
- 首次接入需用户自行提供或配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`；不要猜测、记录或回显 Secret。`--gen-cover` 另需 `OPENAI_API_KEY`。
- 先运行预检（如可用），再执行创建或更新。明确告知用户所有外部操作的目标草稿。
- 用户要求正式发布时：先显示标题、草稿 `media_id`、评论设置；**立即询问“确认现在正式发布吗？”**。只有这一次回答明确肯定，才运行 `--publish <media_id> --confirm-publish`。
- 发布提交成功只代表平台已受理；继续查发布状态，只有官方返回成功才报告已公开发布。

## 核心文件

| 路径 | 用途 |
|---|---|
| `references/formatting-workflow.md` | 排版内容诊断、视觉叙事、配图、验收 |
| `references/design-system.md` | 微信安全的统一设计 token 与版式纪律 |
| `references/style-recipes.md` | 多种内容类型的视觉配方 |
| `references/components.md` | 可直接复制的内联 HTML / 静态 SVG 组件 |
| `references/wechat-html-spec.md` | 微信 HTML/CSS 格式硬约束 |
| `references/integration-workflow.md` | 凭证、预检、草稿与发布操作 |
| `references/onboarding.md` | 新手从零拿凭证、配白名单、填 .env 的引导 |
| `prompts/wechat-format-prompt.md` | 给网页 AI 的精排提示词 |
| `scripts/publish.ts` | CLI：预检、草稿生命周期、正式发布 |
| `scripts/wechat.ts` | 微信官方 API 客户端 |

## 完成报告

- **排版**：给出 HTML 位置、所选视觉配方、已完成的本地检查、封面图生图提示词，以及如何复制到编辑器。
- **草稿**：报告标题与 `media_id`，说明用户可在 `https://mp.weixin.qq.com` 的草稿箱预览。
- **正式发布**：区分“已提交”“处理中”“已发布”“失败”；只报告官方实际返回的状态与标识。
