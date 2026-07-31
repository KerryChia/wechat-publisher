#!/usr/bin/env -S npx tsx
/**
 * Convert a remote or local image into a copy-preview-safe data URI.
 * The output contract remains exactly: data:image/...;base64,... on stdout.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Sharp = typeof import("sharp");

function die(message: string): never {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

function parseArgs(): { src: string; maxKb: number; maxPx: number } {
  const args = process.argv.slice(2);
  let src = "";
  let maxKb = 980;
  let maxPx = 1080;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max-kb") maxKb = Number(args[++i]);
    else if (args[i] === "--max-px") maxPx = Number(args[++i]);
    else if (!args[i].startsWith("--")) src = args[i];
  }
  if (!src || !Number.isFinite(maxKb) || maxKb <= 0 || !Number.isFinite(maxPx) || maxPx <= 0) {
    die("用法: npx tsx img2base64.ts <图片URL或本地路径> [--max-kb 980] [--max-px 1080]");
  }
  return { src, maxKb, maxPx };
}

function sizeKb(path: string): number {
  return statSync(path).size / 1024;
}

function mimeFromBytes(path: string): string {
  const bytes = readFileSync(path).subarray(0, 16);
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "";
}

async function fetchToFile(src: string, dir: string): Promise<string> {
  const out = join(dir, "in.bin");
  if (existsSync(src)) {
    copyFileSync(src, out);
    return out;
  }
  if (!/^https?:\/\//i.test(src)) die(`既不是有效 URL 也不是存在的本地路径: ${src}`);
  process.stderr.write(`↓ 下载 ${src}\n`);
  let response: Response;
  try {
    response = await fetch(src, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(30_000) });
  } catch {
    die("下载失败（网络、反爬或超时）。换一张图，或换一个直链。");
  }
  if (!response.ok) die(`下载失败（HTTP ${response.status}）。换一张图，或换一个直链。`);
  writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  return out;
}

async function loadSharp(): Promise<Sharp | undefined> {
  try {
    const module = await import("sharp");
    return module.default;
  } catch {
    return undefined;
  }
}

function compressWithSips(input: string, output: string, maxKb: number, maxPx: number): void {
  for (const quality of [85, 72, 60, 48, 35]) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality), "-Z", String(maxPx), input, "--out", output]);
    process.stderr.write(`  压缩 q=${quality} → ${sizeKb(output).toFixed(0)}KB\n`);
    if (sizeKb(output) <= maxKb) return;
  }
}

async function compressImage(input: string, output: string, maxKb: number, maxPx: number): Promise<void> {
  const sharp = await loadSharp();
  if (sharp) {
    for (const quality of [85, 72, 60, 48, 35]) {
      await sharp(input).rotate().resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toFile(output);
      process.stderr.write(`  压缩 q=${quality} → ${sizeKb(output).toFixed(0)}KB\n`);
      if (sizeKb(output) <= maxKb) return;
    }
    return;
  }
  if (process.platform === "darwin") {
    compressWithSips(input, output, maxKb, maxPx);
    return;
  }
  die("图片需要压缩，但未安装 sharp。运行 npm install 后重试；macOS 可使用系统自带 sips。");
}

async function main() {
  const { src, maxKb, maxPx } = parseArgs();
  const dir = mkdtempSync(join(tmpdir(), "img2b64-"));
  const raw = await fetchToFile(src, dir);
  const mime = mimeFromBytes(raw);
  if (!mime.startsWith("image/")) die("抓到的不是 png/jpeg/gif/webp 图片——可能是反爬返回的网页。换一张真实图片直链。");
  process.stderr.write(`✓ 是图片: ${mime}, ${sizeKb(raw).toFixed(0)}KB\n`);

  let finalPath = raw;
  let finalMime = mime;
  if (sizeKb(raw) > maxKb || mime === "image/png" || mime === "image/webp") {
    const jpg = join(dir, "out.jpg");
    await compressImage(raw, jpg, maxKb, maxPx);
    if (sizeKb(jpg) > maxKb) die(`压到最低质量仍 >${maxKb}KB（${sizeKb(jpg).toFixed(0)}KB）。换一张更小/更简单的图。`);
    finalPath = jpg;
    finalMime = "image/jpeg";
  }

  const base64 = readFileSync(finalPath).toString("base64");
  process.stderr.write(`✓ 完成: ${finalMime}, base64 长度 ${(base64.length / 1024).toFixed(0)}KB\n`);
  process.stdout.write(`data:${finalMime};base64,${base64}\n`);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
