# 新手 Onboarding：从零拿到凭证并配置

当用户想接入公众号草稿/发布，但还不知道 AppID / AppSecret 在哪取、IP 白名单怎么配时，按本引导一步步带。**只在用户需要接入 API 工作流时走这套流程**；纯排版不需要。

## 前置判断

先问一句确认：

> 你是不是已经能在 mp.weixin.qq.com 后台进「开发 → 基本配置」？如果公众号还没认证或你没后台权限，这套 API 流程暂时用不了，可以先用纯排版工作流。

只有用户答复「能进后台 / 有权限」才继续。

## Step 1 — 取 AppID 和 AppSecret

引导用户操作（**不要替用户点**，只给路径）：

1. 浏览器打开 `https://mp.weixin.qq.com`，扫码登录。
2. 左侧菜单 → **设置与开发** → **基本配置**。
3. 页面上半部分就能看到 **AppID（应用 ID）**，形如 `wx` 开头的一串。
4. 同一区块的 **AppSecret（应用密钥）** 默认是隐藏的，点「**重置**」会弹扫码确认，重置后**只显示一次**，让用户当场复制下来。
   - 重置会让旧 Secret 立即失效；如果之前有别的机器/服务在用旧 Secret，先确认再重置。
   - 如果用户之前从没生成过，部分后台是「**启用**」按钮，点启用后同样只显示一次。

**安全纪律**：
- 让用户把 AppSecret 直接粘到本地 `.env`，**不要贴到对话里**、不要贴到 git、不要截图发群。
- agent 自己**永远不回显 AppSecret**；读 `.env` 是为了用，不是为了展示。如果必须在日志里提到，用 `***` 遮住。

## Step 2 — 配 IP 白名单

这一步不做的话，调 API 会直接报 `40164 invalid ip`。

1. 还是「**基本配置**」那个页面，往下找「**IP 白名单**」区块，点「**修改**」（可能要扫码）。
2. 把**运行 publish.ts 的那台机器的公网出口 IP** 加进去，一行一个。
   - 本地开发：让用户去 `https://ifconfig.me` 或 `curl ifconfig.me` 查当前出口 IP。注意家庭宽带 IP 可能会变；公司/校园网常走 NAT，加进白名单的是出口 IP 不是内网 IP。
   - 服务器：填服务器公网 IP。
   - 走代理或 VPN 的话，白名单要填**代理出口 IP**，不是本机直连 IP。
3. 一个 AppID 白名单上限通常 100 条左右，够用；不用加内网段，只加会真正发起请求的出口 IP。

## Step 3 — 写 .env

在 skill 根目录或 `scripts/` 目录下，从 `.env.example` 复制一份 `.env`：

```bash
cp .env.example .env
```

填成这样（**不要把真实 Secret 贴到对话或 commit**）：

```env
WECHAT_APP_ID=wx你的AppID
WECHAT_APP_SECRET=你的AppSecret
# 可选：--gen-cover 自动封面才需要
# OPENAI_API_KEY=sk-...
# OPENAI_IMAGE_MODEL=gpt-image-2
```

`.env` 已在 `.gitignore` 里，不会进 git。详见 [SECURITY.md](../SECURITY.md)。

## Step 4 — 验证凭证是否通

跑一条最轻的 API 调用确认链路通：

```bash
cd scripts
npm install
npx tsx publish.ts --list --count 1
```

- 返回草稿列表（哪怕空）= 凭证 + 白名单都 OK，onboarding 完成。
- `40164` → IP 白名单没配或配错，回 Step 2。
- `40193 / 48001` → 公众号未认证或接口没授权，见下表。
- `Missing WECHAT_APP_ID` → `.env` 没被读到；确认 `.env` 在 skill 根或 `scripts/` 下，且字段名拼写正确。

## 认证类型对照

| 公众号类型 | 能用本 skill 的 API 吗 |
|---|---|
| 已认证服务号 | ✅ 全功能 |
| 已认证订阅号 | ✅ 草稿 + 发布可用（部分接口权限有差异，以 API 返回为准） |
| 未认证订阅号 | ❌ 没有草稿/发布接口权限，只能用纯排版工作流 |
| 个人订阅号 | ❌ 同上 |
| 测试号 | ⚠️ 能调 token，但草稿/发布行为和正式号不一致，不建议用来发正式稿 |

如果用户公众号没认证，别硬走 API 流程，引导回纯排版工作流（复制 HTML 到编辑器手动发）。

## 常见卡点速查

| 用户说 | 真正的问题 | 处理 |
|---|---|---|
| 「AppSecret 在哪看」 | 后台基本配置，点重置/启用，只显示一次 | Step 1 |
| 「我点重置怕把别的搞坏」 | 重置会让旧 Secret 失效 | 先确认没有别的服务在用旧 Secret，再重置；拿新 Secret 后更新那些服务 |
| 「报 40164」 | 出口 IP 不在白名单 | Step 2，注意代理/VPN/NAT |
| 「白名单填了还是 40164」 | 填的不是真正出口 IP | 让用户 `curl ifconfig.me` 看真实出口，或关代理再试 |
| 「Missing WECHAT_APP_ID」 | `.env` 没读到 | 确认文件名是 `.env` 不是 `.env.txt`，字段名是 `WECHAT_APP_ID` |
| 「我公众号没认证」 | 没接口权限 | 改走纯排版工作流 |
