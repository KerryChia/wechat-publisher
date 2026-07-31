import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { renderArticle, extractImageSrcs } from "./render.ts";
import {
  getAccessToken,
  uploadBodyImage,
  uploadCoverMaterial,
  addDraft,
  getDrafts,
  updateDraft,
  deleteDraft,
  submitFreePublish,
  getFreePublishStatus,
} from "./wechat.ts";
import { generateCover, coverPrompt } from "./imagegen.ts";

interface Args {
  input: string;
  title?: string;
  author?: string;
  digest?: string;
  cover?: string;
  genCover: boolean;
  sourceUrl?: string;
  noComment: boolean;
  fansOnly: boolean;
  model?: string;
  check: boolean;
  publishId?: string;
  confirmPublish: boolean;
  publishStatusId?: string;
  showId?: string;
  // Draft management
  list: boolean;
  updateId?: string;
  deleteId?: string;
  index: number;
  offset: number;
  count: number;
  noContent: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    input: "", genCover: false, noComment: false, fansOnly: false, check: false,
    confirmPublish: false, list: false, index: 0, offset: 0, count: 10, noContent: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--gen-cover") a.genCover = true;
    else if (t === "--no-comment") a.noComment = true;
    else if (t === "--fans-only") a.fansOnly = true;
    else if (t === "--check" || t === "--dry-run") a.check = true;
    else if (t === "--confirm-publish") a.confirmPublish = true;
    else if (t === "--list") a.list = true;
    else if (t === "--no-content") a.noContent = true;
    else if (t === "--title") a.title = argv[++i];
    else if (t === "--author") a.author = argv[++i];
    else if (t === "--digest") a.digest = argv[++i];
    else if (t === "--cover") a.cover = argv[++i];
    else if (t === "--source-url") a.sourceUrl = argv[++i];
    else if (t === "--model") a.model = argv[++i];
    else if (t === "--update") a.updateId = argv[++i];
    else if (t === "--delete") a.deleteId = argv[++i];
    else if (t === "--show") a.showId = argv[++i];
    else if (t === "--publish") a.publishId = argv[++i];
    else if (t === "--publish-status") a.publishStatusId = argv[++i];
    else if (t === "--index") a.index = parseInt(argv[++i], 10);
    else if (t === "--offset") a.offset = parseInt(argv[++i], 10);
    else if (t === "--count") a.count = parseInt(argv[++i], 10);
    else if (!t.startsWith("--") && !a.input) a.input = t;
  }
  if (a.noComment && a.fansOnly) throw new Error("--no-comment and --fans-only cannot be used together.");
  // Subcommands don't require input.
  if (!a.input && !a.list && !a.updateId && !a.deleteId && !a.showId && !a.publishId && !a.publishStatusId) {
    throw new Error(
      "Usage:\n" +
        "  publish.ts <article.html|article.md> [--check] [--title ..] [--cover <path> | --gen-cover] [--author ..] [--digest ..] [--no-comment | --fans-only]\n" +
        "  publish.ts --list [--offset N] [--count N] [--no-content] | --show <media_id>\n" +
        "  publish.ts --update <media_id> [--index N] [--title ..] [--author ..] [--digest ..] [<article.html>]\n" +
        "  publish.ts --delete <media_id>\n" +
        "  publish.ts --publish <media_id> --confirm-publish | --publish-status <publish_id>",
    );
  }
  if (a.check && !a.input) throw new Error("--check needs an article.html or article.md input.");
  return a;
}

function loadEnv(scriptDir: string): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const candidates = [join(process.cwd(), ".env"), resolve(scriptDir, "..", ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

interface Front {
  data: Record<string, string>;
  body: string;
}

function parseFrontmatter(raw: string): Front {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (kv) data[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: raw.slice(m[0].length) };
}

function autoTitle(body: string): string {
  const h = body.match(/^#{1,3}\s+(.+)$/m);
  return h ? h[1].trim() : "";
}

function autoDigest(body: string): string {
  const plain = body
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 120);
}

// Resolve any image src (local path, remote URL, or data URI) to a local file path.
async function resolveImageToFile(src: string, articleDir: string): Promise<string> {
  if (src.startsWith("data:image/")) {
    const m = src.match(/^data:image\/([a-z]+);base64,(.+)$/i);
    if (!m) throw new Error("Malformed data URI image");
    const path = join(tmpdir(), `wechat-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${m[1]}`);
    await writeFile(path, Buffer.from(m[2], "base64"));
    return path;
  }
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to download image: ${src} (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (src.split(".").pop() || "png").split(/[?#]/)[0].toLowerCase();
    const path = join(tmpdir(), `wechat-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${/^(png|jpe?g|gif)$/.test(ext) ? ext : "png"}`);
    await writeFile(path, buf);
    return path;
  }
  const local = isAbsolute(src) ? src : resolve(articleDir, src);
  if (!existsSync(local)) throw new Error(`Image file not found: ${local}`);
  return local;
}

function isWechatHosted(src: string): boolean {
  return /^https?:\/\/(mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)/.test(src);
}

// For hand-written .html input: pull out the article content.
function extractArticleHtml(raw: string): string {
  const m = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
  if (m) return m[1].trim();
  if (/<html[\s>]/i.test(raw)) {
    throw new Error(
      "HTML file looks like a full document. Wrap the article content in\n" +
        "<!-- ARTICLE HTML START --> ... <!-- ARTICLE HTML END --> markers.",
    );
  }
  return raw.trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string): string {
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h ? stripTags(h[1]) : "";
}

function htmlDigest(html: string): string {
  return stripTags(html).slice(0, 120);
}

function lintWechatHtml(html: string): string[] {
  const issues: string[] = [];
  if (/<(?:script|iframe|object|embed|form|input)\b/i.test(html)) issues.push("contains a disallowed active/embed/form tag");
  if (/<style\b|<link\b/i.test(html)) issues.push("contains a <style> or <link> tag");
  if (/\s(?:class|id|on[a-z]+)\s*=/i.test(html)) issues.push("contains class/id/event attributes in the article fragment");
  if (/style\s*=\s*[\"'][^\"']*\b(?:position|z-index|transform|animation)\s*:/i.test(html)) issues.push("contains a WeChat-unreliable CSS property");
  return issues;
}

async function buildLocalArticle(inputPath: string): Promise<{ html: string; body: string; isHtml: boolean; fm: Record<string, string>; title: string; digest: string }> {
  const raw = await readFile(inputPath, "utf8");
  const { data: fm, body } = parseFrontmatter(raw);
  const isHtml = /\.html?$/i.test(inputPath);
  const html = isHtml ? extractArticleHtml(body) : renderArticle(body);
  const title = fm.title || (isHtml ? htmlTitle(html) : autoTitle(body));
  const digest = fm.description || fm.summary || fm.digest || (isHtml ? htmlDigest(html) : autoDigest(body));
  return { html, body, isHtml, fm, title, digest };
}

async function main() {
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const args = parseArgs(process.argv.slice(2));

  // Pure local preflight deliberately runs before credential loading or any network call.
  if (args.check) {
    const inputPath = resolve(process.cwd(), args.input);
    if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
    const article = await buildLocalArticle(inputPath);
    const title = args.title || article.title;
    const issues = lintWechatHtml(article.html);
    const srcs = [...new Set(extractImageSrcs(article.html))];
    console.log("▶ Local WeChat article preflight");
    console.log(`  input:  ${inputPath}`);
    console.log(`  format: ${article.isHtml ? "component HTML" : "Markdown fallback"}`);
    console.log(`  title:  ${title || "(missing)"}`);
    console.log(`  images: ${srcs.length ? srcs.join(", ") : "(none)"}`);
    if (!title) issues.push("no title found; pass --title or add a title/frontmatter");
    if (issues.length) throw new Error(`Preflight failed:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    console.log("✅ Preflight passed. No credentials, uploads, drafts, or publication requests were made.");
    return;
  }

  if (args.publishId && !args.confirmPublish) {
    throw new Error("Refusing to publish without --confirm-publish. Obtain a final explicit user confirmation immediately before this command.");
  }

  const env = loadEnv(scriptDir);
  const appId = env.WECHAT_APP_ID;
  const appSecret = env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Missing WECHAT_APP_ID / WECHAT_APP_SECRET. Set them in .env (see .env.example).");

  console.log("▶ Fetching WeChat access token...");
  const token = await getAccessToken(appId, appSecret);

  // ─── Subcommand: --publish-status ──────────────────────────────────
  if (args.publishStatusId) {
    const status = await getFreePublishStatus(args.publishStatusId, token);
    const labels: Record<number, string> = { 0: "success", 1: "publishing", 2: "original-article-failed", 3: "success", 4: "deleted", 5: "publish-failed", 6: "original-article-failed" };
    console.log(`▶ Publish ${status.publishId}: ${labels[status.publishStatus] || `unknown (${status.publishStatus})`}`);
    if (status.articleId) console.log(`  article_id: ${status.articleId}`);
    if (status.failIdx?.length) console.log(`  failed article indexes: ${status.failIdx.join(", ")}`);
    return;
  }

  // ─── Subcommand: --publish ─────────────────────────────────────────
  if (args.publishId) {
    if (!args.confirmPublish) {
      throw new Error("Refusing to publish without --confirm-publish. Obtain a final explicit user confirmation immediately before this command.");
    }
    console.log(`▶ Submitting draft ${args.publishId} for official publication...`);
    const publishId = await submitFreePublish(args.publishId, token);
    console.log("✅ Publication submitted to WeChat. This is not yet proof of public availability.");
    console.log(`   publish_id: ${publishId}`);
    console.log(`   Query status: npx tsx publish.ts --publish-status ${publishId}`);
    return;
  }

  // ─── Subcommand: --list ────────────────────────────────────────────
  if (args.list) {
    const result = await getDrafts(args.offset, args.count, args.noContent, token);
    console.log(`\n草稿箱共 ${result.total_count} 篇，显示第 ${args.offset + 1}–${args.offset + result.item_count} 篇：\n`);
    for (let i = 0; i < result.item.length; i++) {
      const item = result.item[i];
      const news = item.content?.news_item?.[0];
      const title = news?.title || "(无标题)";
      const author = news?.author || "";
      const time = item.update_time ? new Date(item.update_time * 1000).toLocaleString("zh-CN") : "";
      console.log(`  [${args.offset + i}] ${title}${author ? ` · ${author}` : ""} — ${item.media_id} — ${time}`);
    }
    return;
  }

  // ─── Subcommand: --show ────────────────────────────────────────────
  if (args.showId) {
    const result = await getDrafts(0, 100, false, token);
    const draft = result.item.find((item) => item.media_id === args.showId);
    if (!draft) throw new Error(`Draft not found in the first ${result.item_count} drafts: ${args.showId}`);
    const articles = draft.content?.news_item || [];
    console.log(`▶ Draft ${draft.media_id} (${articles.length} article(s))`);
    for (let index = 0; index < articles.length; index++) {
      const article = articles[index];
      console.log(`  [${index}] ${article.title || "(untitled)"}${article.author ? ` · ${article.author}` : ""}`);
    }
    return;
  }

  // ─── Subcommand: --delete ──────────────────────────────────────────
  if (args.deleteId) {
    console.log(`▶ Deleting draft ${args.deleteId}...`);
    await deleteDraft(args.deleteId, token);
    console.log(`\n✅ Draft deleted: ${args.deleteId}`);
    return;
  }

  // ─── Subcommand: --update ──────────────────────────────────────────
  if (args.updateId) {
    // Step 1: Fetch current draft to get full article content
    console.log(`▶ Fetching draft ${args.updateId}...`);
    const drafts = await getDrafts(0, 20, false, token);
    const draft = drafts.item.find((d) => d.media_id === args.updateId);
    if (!draft) throw new Error(`Draft not found: ${args.updateId}`);
    const current = draft.content?.news_item?.[args.index];
    if (!current) throw new Error(`Article index ${args.index} not found in draft.`);

    // Step 2: Build full article, overlaying user-provided fields
    const article: {
      title: string;
      author: string;
      digest: string;
      content: string;
      thumbMediaId: string;
      contentSourceUrl: string;
      needOpenComment: number;
      onlyFansCanComment: number;
    } = {
      title: current.title || "",
      author: current.author || "",
      digest: current.digest || "",
      content: current.content || "",
      thumbMediaId: current.thumb_media_id || "",
      contentSourceUrl: "",
      needOpenComment: 1,
      onlyFansCanComment: 0,
    };

    if (args.title !== undefined) article.title = args.title;
    if (args.author !== undefined) article.author = args.author;
    if (args.digest !== undefined) article.digest = args.digest;
    if (args.sourceUrl !== undefined) article.contentSourceUrl = args.sourceUrl;
    if (args.noComment) article.needOpenComment = 0;
    if (args.fansOnly) article.onlyFansCanComment = 1;

    // If an input file is provided, extract its HTML content
    if (args.input) {
      const inputPath = resolve(process.cwd(), args.input);
      if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
      const raw = await readFile(inputPath, "utf8");
      const { body } = parseFrontmatter(raw);
      const isHtml = /\.html?$/i.test(inputPath);
      if (isHtml) {
        article.content = extractArticleHtml(body);
      } else {
        article.content = renderArticle(body);
      }
      if (args.title === undefined && isHtml) {
        const t = htmlTitle(article.content);
        if (t) article.title = t;
      }
    }

    const updateIssues = args.input ? lintWechatHtml(article.content) : [];
    if (updateIssues.length) throw new Error(`Updated article is not WeChat-safe:\n${updateIssues.map((issue) => `  - ${issue}`).join("\n")}`);

    // Resolve cover image if provided
    if (args.cover) {
      const coverPath = resolve(process.cwd(), args.cover);
      if (!existsSync(coverPath)) throw new Error(`Cover image not found: ${coverPath}`);
      console.log("▶ Uploading new cover to WeChat material library...");
      article.thumbMediaId = await uploadCoverMaterial(coverPath, token);
    }

    // Step 3: Upload any new inline images if content changed
    if (args.input && article.content) {
      const srcs = [...new Set(extractImageSrcs(article.content))].filter((s) => !isWechatHosted(s));
      if (srcs.length) console.log(`▶ Uploading ${srcs.length} inline image(s) to WeChat...`);
      for (const src of srcs) {
        const file = await resolveImageToFile(src, process.cwd());
        const url = await uploadBodyImage(file, token);
        article.content = article.content.split(`src="${src}"`).join(`src="${url}"`);
        console.log(`  ✓ ${src} → ${url}`);
      }
    }

    console.log(`▶ Updating draft ${args.updateId} (index ${args.index})...`);
    await updateDraft(args.updateId, args.index, article, token);
    console.log(`\n✅ Draft updated: ${args.updateId}`);
    return;
  }

  const inputPath = resolve(process.cwd(), args.input);
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const articleDir = dirname(inputPath);
  const raw = await readFile(inputPath, "utf8");
  const { data: fm, body } = parseFrontmatter(raw);
  const isHtml = /\.html?$/i.test(inputPath);

  let html: string;
  if (isHtml) {
    html = extractArticleHtml(body);
    console.log("▶ Using hand-written HTML article (component layout)...");
  } else {
    html = renderArticle(body);
    console.log("▶ Rendering markdown → WeChat-compliant HTML (fallback theme)...");
  }

  const htmlIssues = lintWechatHtml(html);
  if (htmlIssues.length) throw new Error(`Article is not WeChat-safe:\n${htmlIssues.map((issue) => `  - ${issue}`).join("\n")}`);

  const title = args.title || fm.title || (isHtml ? htmlTitle(html) : autoTitle(body));
  if (!title) throw new Error("No title found. Pass --title or add a frontmatter title.");
  const author = args.author || fm.author || "";
  const digest =
    args.digest || fm.description || fm.summary || fm.digest || (isHtml ? htmlDigest(html) : autoDigest(body));

  console.log(`▶ Title: ${title}`);

  // Upload inline images and rewrite their src to WeChat-hosted URLs.
  const srcs = [...new Set(extractImageSrcs(html))].filter((s) => !isWechatHosted(s));
  if (srcs.length) console.log(`▶ Uploading ${srcs.length} inline image(s) to WeChat...`);
  for (const src of srcs) {
    const file = await resolveImageToFile(src, articleDir);
    const url = await uploadBodyImage(file, token);
    html = html.split(`src="${src}"`).join(`src="${url}"`);
    console.log(`  ✓ ${src} → ${url}`);
  }

  // Resolve the cover image.
  let coverPath = args.cover ? resolve(process.cwd(), args.cover) : "";
  if (coverPath && !existsSync(coverPath)) throw new Error(`Cover image not found: ${coverPath}`);
  if (!coverPath && fm.cover) {
    const c = resolve(articleDir, fm.cover);
    if (existsSync(c)) coverPath = c;
  }
  if (!coverPath && args.genCover) {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new Error("--gen-cover needs OPENAI_API_KEY in .env");
    console.log("▶ Generating cover image via OpenAI...");
    coverPath = await generateCover(coverPrompt(title), key, args.model || env.OPENAI_IMAGE_MODEL || "gpt-image-2");
    console.log(`  ✓ Cover saved: ${coverPath}`);
  }
  if (!coverPath) {
    throw new Error("A cover image is required. Pass --cover <path> or --gen-cover.");
  }

  console.log("▶ Uploading cover to WeChat material library...");
  const thumbMediaId = await uploadCoverMaterial(coverPath, token);

  console.log("▶ Creating draft...");
  const draftId = await addDraft(
    {
      title,
      author,
      digest,
      content: html,
      thumbMediaId,
      contentSourceUrl: args.sourceUrl,
      needOpenComment: args.noComment ? 0 : 1,
      onlyFansCanComment: args.fansOnly ? 1 : 0,
    },
    token,
  );

  console.log("\n✅ Draft created in WeChat Official Account draft box");
  console.log(`   Title:    ${title}`);
  console.log(`   Author:   ${author || "(none)"}`);
  console.log(`   Digest:   ${digest}`);
  console.log(`   draft media_id: ${draftId}`);
  console.log("   Open https://mp.weixin.qq.com → 内容管理 → 草稿箱 to preview & publish.");
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
