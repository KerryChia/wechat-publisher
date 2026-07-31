// Screenshot a WeChat article in mobile viewport (full page).
// Usage: node shoot.js <url> <out.png> [width] [height]
const { chromium } = require("playwright");

(async () => {
  const url = process.argv[2];
  const out = process.argv[3];
  const width = parseInt(process.argv[4] || "414", 10);
  const height = parseInt(process.argv[5] || "820", 10);
  if (!url || !out) {
    console.error("usage: node shoot.js <url> <out.png> [width] [height]");
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002828) NetType/WIFI Language/zh_CN",
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  // hide floating WeChat UI bits if any
  await page.addStyleTag({
    content: `#js_pc_qr_code, .rich_media_extra_area, .qr_code_pc_outer, .reward_area, .rich_media_tool_area, .weui-dialog, .js_modal, #js_share_source, .article_comment_area, .rich_media_area_extra { display:none !important; }`,
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved:", out);
  await browser.close();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
