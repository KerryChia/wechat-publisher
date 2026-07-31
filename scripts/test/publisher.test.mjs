import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = fileURLToPath(new URL("../", import.meta.url));

function run(args) {
  try {
    return { status: 0, output: execFileSync(process.execPath, [join(scriptsDir, "node_modules", "tsx", "dist", "cli.mjs"), "publish.ts", ...args], { cwd: scriptsDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.message ?? ""}\n${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}` };
  }
}

test("local check accepts a marker-bounded inline article without credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "wechat-publisher-test-"));
  const article = join(dir, "article.html");
  writeFileSync(article, "<!-- ARTICLE HTML START --><section style=\"padding:20px\"><h1 style=\"display:none\">Test title</h1><p style=\"color:#333\">Text</p></section><!-- ARTICLE HTML END -->");
  const result = run([article, "--check"]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Preflight passed/);
});

test("local check rejects unsafe fragment markup", () => {
  const dir = mkdtempSync(join(tmpdir(), "wechat-publisher-test-"));
  const article = join(dir, "unsafe.html");
  writeFileSync(article, "<!-- ARTICLE HTML START --><p class=\"bad\" style=\"color:#333\">Text</p><!-- ARTICLE HTML END -->");
  const result = run([article, "--check"]);
  rmSync(dir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /class\/id/);
});

test("publication command refuses to proceed without confirmation", () => {
  const result = run(["--publish", "draft-media-id"]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /--confirm-publish/);
});
