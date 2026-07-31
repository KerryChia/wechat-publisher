# Security

## Credentials

This skill never ships real WeChat or OpenAI credentials.

1. Copy `.env.example` to `.env` (skill root or `scripts/`).
2. Fill in your own `WECHAT_APP_ID` / `WECHAT_APP_SECRET`.
3. Add the machine's public IP to the WeChat Official Account API allowlist.
4. Keep `.env` local. It is gitignored.

Do not paste AppSecret into issues, PRs, chat logs, or screenshots.

## Publishing safety

- Creating a draft is **not** a public publish.
- Formal publish requires an explicit confirmation step in the agent workflow **and** the CLI flag `--confirm-publish`.
- Treat publish status carefully: "submitted" ≠ "published".

## Reporting issues

If you believe a secret was committed to a fork or mirror, rotate the WeChat AppSecret in the Official Account admin console immediately, then open an issue describing the exposure without restating the secret value.
