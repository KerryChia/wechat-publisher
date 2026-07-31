# 公众号接入与发布工作流

本模块只处理官方 API 的草稿生命周期与正式发布。排版请先完成 [formatting-workflow.md](formatting-workflow.md)；微信正文规则见 [wechat-html-spec.md](wechat-html-spec.md)。

## 凭证与前提

- 仅在用户要求进草稿箱或管理草稿时配置 `.env`：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`；自动封面另需 `OPENAI_API_KEY`。
- **如果用户不知道这些凭证在哪取、或 IP 白名单没配过**，先走 [onboarding.md](onboarding.md) 把凭证和白名单搞定，再回到本文件。
- 用户应自行从公众号后台取得凭证，并把运行机公网 IP 加入 API 白名单。不要猜、不要在回复中回显 AppSecret。
- 草稿、更新、删除、提交正式发布都属于外部操作；执行前说明目标和后果。

## 操作顺序

### 1. 本地预检（推荐）

```bash
cd scripts
npx tsx publish.ts article.html --check
```

预检只读取本地文章：检查输入、标题/摘要、正文标记、微信禁用结构与图片引用；它不取 token、不上传、不写草稿。修复所有阻断错误后再接入。

### 2. 创建草稿

```bash
npx tsx publish.ts article.html --title "标题" --author "作者" \
  --cover cover.jpg --source-url "https://example.com/source"
```

`.html/.htm` 直接提取标记区；`.md` 继续走固定主题 `render.ts`。正文中的本地路径、远程 URL 或 data URI 图片会上传并替换为微信 URL；静态 SVG 原样保留。新建草稿必须有封面，使用 `--cover` 或 `--gen-cover`。

### 3. 草稿管理

```bash
npx tsx publish.ts --list --offset 0 --count 10
npx tsx publish.ts --show <media_id>
npx tsx publish.ts --update <media_id> article.html --title "新标题"
npx tsx publish.ts --delete <media_id>
```

更新只覆盖明确传入的字段/新正文；删除前必须得到用户针对该草稿的明确授权。评论设置：`--no-comment` 关闭评论；`--fans-only` 仅允许粉丝评论；两者不能同时使用。

### 4. 正式发布：强制二次确认

创建草稿不是发布。用户要求发布时，先展示草稿标题、`media_id` 和评论设置，并在真正执行前询问：

> 将通过公众号官方接口正式发布《标题》（草稿 `media_id`：`…`）。内容将对外可见。确认现在发布吗？

只有用户对本次问题明确答复肯定后，才可运行：

```bash
npx tsx publish.ts --publish <media_id> --confirm-publish
```

`--confirm-publish` 是刻意设置的命令行安全闸；它不替代对话中的最终用户确认。命令提交后，使用状态查询确认平台处理结果：

```bash
npx tsx publish.ts --publish-status <publish_id>
```

“已提交”“处理中”和“已发布”必须在完成报告中严格区分。权限、内容审核、平台发布策略或 API 错误均可能阻止发布；按官方返回的信息报告，不承诺成功。

## 常见错误

| 现象 | 处理 |
|---|---|
| `Missing WECHAT_APP_ID` | 没配 `.env` 或字段名拼错；从零开始见 [onboarding.md](onboarding.md) Step 3 |
| `40164` | 运行机出口 IP 不在白名单；配白名单见 [onboarding.md](onboarding.md) Step 2 |
| `40193 / 48001` | 公众号未认证或接口没授权；对照 [onboarding.md](onboarding.md) 认证类型表，必要时改走纯排版 |
| 正文图片过大 | 压缩为 jpg/png/gif 且不超过 1 MB |
| `HTML file looks like a full document` | 用 `ARTICLE HTML START/END` 包住正文 |
| 发布被拒绝或处理中 | 查询发布状态；按平台的审核/权限返回处理 |
