import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  IMAGE_FETCH_TIMEOUT_MS, PLACEHOLDER_STYLE, cloneChildrenInto, copyFeedback,
  fetchImageAsDataUri, placeholderHtml, prepareArticleClone, prepareFallbackClone,
  startClipboardCopy,
} from "../copy-placeholder.mjs";

const PNG_DATA = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

class ImageStub {
  constructor({ src, alt = "", width = 0, height = 0 }) {
    this.attrs = { src, alt }; this.width = width; this.height = height;
    this.outerHTML = `<img src="${src}" alt="${alt}">`;
  }
  getAttribute(name) { return this.attrs[name] || ""; }
  setAttribute(name, value) { this.attrs[name] = value; this.outerHTML = `<img src="${value}">`; }
  clone() { return new ImageStub({ src: this.attrs.src, alt: this.attrs.alt, width: this.width, height: this.height }); }
}

class ArticleStub {
  constructor(images, id = "article-content") {
    this.images = images; this.id = id; this.innerText = "正文纯文本"; this.textContent = "正文纯文本";
    this.childNodes = [{ markup: "<p>正文子节点</p>", cloneNode() { return { markup: this.markup }; } }];
  }
  cloneNode() { return new ArticleStub(this.images.map((image) => image.clone()), this.id); }
  querySelectorAll() { return this.images; }
  get innerHTML() { return `<section style="border:1px solid #e5e7eb">${this.images.map((image) => image.outerHTML).join("")}<p>图注保留</p></section>`; }
}

function fetchStub(outcomes, calls = []) {
  return async (src) => {
    calls.push(src);
    const value = outcomes[src];
    if (value instanceof Error) throw value;
    return { ok: true, headers: { get: () => String(value.size) }, blob: async () => value };
  };
}

const blobToDataUri = async (blob) => blob.dataUri;
const imageBlob = { size: 3, type: "image/png", dataUri: PNG_DATA };
class BlobStub { constructor(parts, options) { this.value = parts.join(""); this.type = options.type; } }

function immediateClipboard(capture) {
  return {
    ClipboardItemCtor: class { constructor(value) { capture.item = value; } },
    clipboard: { write(items) { capture.writeCalled = true; capture.items = items; return Promise.resolve(); } },
    BlobCtor: BlobStub,
  };
}

test("fetch success becomes a data URI without changing the original object", async () => {
  const original = new ArticleStub([new ImageStub({ src: "https://img.test/a.png", alt: "A" })]);
  const result = await prepareArticleClone(original, { fetchImpl: fetchStub({ "https://img.test/a.png": imageBlob }), blobToDataUri });
  assert.equal(result.placeholderCount, 0);
  assert.equal(result.clone.images[0].attrs.src, PNG_DATA);
  assert.equal(original.images[0].attrs.src, "https://img.test/a.png");
});

test("failed image becomes an alt-free URL-free inline span placeholder", async () => {
  const url = "https://private.test/image?token=secret";
  const alt = '<绝不输出的封面 & "说明">';
  const result = await prepareArticleClone(new ArticleStub([new ImageStub({ src: url, alt, width: 670, height: 400 })]), {
    fetchImpl: fetchStub({ [url]: new Error("blocked") }), blobToDataUri,
  });
  const html = result.clone.images[0].outerHTML;
  assert.equal(result.placeholderCount, 1);
  assert.match(result.clone.innerHTML, /border:1px solid #e5e7eb/);
  assert.match(result.clone.innerHTML, /图注保留/);
  assert.match(html, /^<span style=/);
  assert.match(html, /图片待替换/);
  assert.match(html, /选中本框内文字后直接粘贴原图/);
  assert.doesNotMatch(html, /绝不输出|封面|说明|private\.test|token=secret|https?:\/\//);
  assert.match(html, /border:1px dashed/);
  assert.match(html, /border-radius:10px/);
  assert.match(html, /background:#f5f6f8/);
  assert.match(html, /height:200px/);
  assert.doesNotMatch(html, /<(?:section|div|p)\b|class=|id=|position:|<style|<script/i);
});

test("mixed images run concurrently and preserve reasonable data URIs", async () => {
  const one = "https://img.test/one.png"; const two = "https://img.test/two.png"; const calls = [];
  const original = new ArticleStub([new ImageStub({ src: PNG_DATA }), new ImageStub({ src: one }), new ImageStub({ src: two })]);
  const promise = prepareArticleClone(original, { fetchImpl: fetchStub({ [one]: imageBlob, [two]: new Error("no") }, calls), blobToDataUri });
  assert.deepEqual(calls, [one, two]);
  const result = await promise;
  assert.equal(result.placeholderCount, 1);
  assert.equal(result.clone.images[0].attrs.src, PNG_DATA);
  assert.equal(result.clone.images[1].attrs.src, PNG_DATA);
  assert.match(result.clone.images[2].outerHTML, /图片待替换/);
  assert.deepEqual(original.images.map((image) => image.attrs.src), [PNG_DATA, one, two]);
});

test("single-image fetch times out and aborts", async () => {
  let aborted = false;
  class Controller { constructor() { this.signal = {}; } abort() { aborted = true; } }
  await assert.rejects(() => fetchImageAsDataUri("https://slow.test/a.png", {
    fetchImpl: () => new Promise(() => {}), timeoutMs: 5, AbortControllerCtor: Controller,
  }), /timed out/);
  assert.equal(aborted, true);
  assert.equal(IMAGE_FETCH_TIMEOUT_MS, 8000);
});

test("synchronous fallback keeps data URIs and never starts fetch", () => {
  const calls = [];
  const article = new ArticleStub([new ImageStub({ src: PNG_DATA }), new ImageStub({ src: "https://img.test/a.png", alt: "private alt" })]);
  const prepared = prepareFallbackClone(article, { fetchImpl: fetchStub({}, calls) });
  assert.equal(prepared.clone.images[0].attrs.src, PNG_DATA);
  assert.match(prepared.clone.images[1].outerHTML, /^<span style=/);
  assert.doesNotMatch(prepared.clone.images[1].outerHTML, /private alt/);
  assert.deepEqual(calls, []);
});

test("fallback child copy excludes the clone root id and shell styles", () => {
  const appended = [];
  const holder = { appendChild(child) { appended.push(child); } };
  const clone = new ArticleStub([]);
  clone.id = "article-content"; clone.style = "max-width:677px";
  cloneChildrenInto(holder, clone);
  assert.deepEqual(appended.map((child) => child.markup), ["<p>正文子节点</p>"]);
  assert.equal(appended.some((child) => child.id === clone.id || child.style === clone.style), false);
});

test("ClipboardItem is written synchronously with Promise<Blob> values before image work resolves", async () => {
  let releaseFetch;
  const waiting = new Promise((resolve) => { releaseFetch = resolve; });
  const capture = {};
  const article = new ArticleStub([new ImageStub({ src: "https://img.test/a.png" })]);
  const started = startClipboardCopy(article, {
    ...immediateClipboard(capture),
    fetchImpl: async () => { await waiting; return { ok: true, headers: { get: () => "3" }, blob: async () => imageBlob }; },
    blobToDataUri,
    execCommandCopy: () => { throw new Error("must not fallback"); },
  });
  assert.equal(started.mode, "clipboard");
  assert.equal(capture.writeCalled, true);
  assert.ok(capture.item["text/html"] instanceof Promise);
  assert.ok(capture.item["text/plain"] instanceof Promise);
  let settled = false; started.completion.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  releaseFetch();
  const result = await started.completion;
  assert.equal(result.method, "clipboard");
  assert.equal((await capture.item["text/html"]).value.includes(PNG_DATA), true);
  assert.equal((await capture.item["text/plain"]).value, "正文纯文本");
});

test("synchronously unavailable Clipboard API immediately falls back without fetching", async () => {
  let fetchCalls = 0; let fallbackClone;
  const article = new ArticleStub([new ImageStub({ src: "https://img.test/a.png" })]);
  const started = startClipboardCopy(article, {
    clipboard: null, ClipboardItemCtor: null, BlobCtor: BlobStub,
    fetchImpl: async () => { fetchCalls += 1; },
    execCommandCopy: (clone) => { fallbackClone = clone; return true; },
  });
  assert.equal(started.mode, "execCommand");
  assert.equal(fetchCalls, 0);
  assert.match(fallbackClone.images[0].outerHTML, /图片待替换/);
  assert.equal((await started.completion).method, "execCommand");
});

test("asynchronous clipboard rejection attempts fallback and reports total failure", async () => {
  const capture = {}; let fallbackCalls = 0;
  const article = new ArticleStub([new ImageStub({ src: PNG_DATA })]);
  const started = startClipboardCopy(article, {
    ...immediateClipboard(capture),
    clipboard: { write() { return Promise.reject(new Error("denied")); } },
    execCommandCopy: () => { fallbackCalls += 1; return true; },
  });
  assert.equal((await started.completion).method, "execCommand");
  assert.equal(fallbackCalls, 1);
  const failed = startClipboardCopy(article, {
    clipboard: null, ClipboardItemCtor: null, BlobCtor: BlobStub, execCommandCopy: () => false,
  });
  await assert.rejects(failed.completion, /复制失败，请手动选择正文复制/);
  assert.equal(copyFeedback(0), "已复制"); assert.equal(copyFeedback(2), "已复制（2 张图片待替换）");
});

test("article template and web prompt keep the audited copy contract", () => {
  const template = readFileSync(fileURLToPath(new URL("../../references/article-template.html", import.meta.url)), "utf8");
  const prompt = readFileSync(fileURLToPath(new URL("../../prompts/wechat-format-prompt.md", import.meta.url)), "utf8");
  for (const source of [template, prompt]) {
    for (const token of ["cloneNode(true)", "1048576", "8000", "Promise", "图片待替换", "选中本框内文字后直接粘贴原图", "text/html", "text/plain", "execCommand('copy')", "复制失败，请手动选择正文复制"]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(source, /createElement\('span'\)/);
    assert.match(source, /Promise\.all\(/);
    assert.match(source, /clone\.childNodes/);
    assert.doesNotMatch(source, /appendChild\(clone\.cloneNode\(true\)\)/);
    assert.doesNotMatch(source, /getAttribute\('alt'\)|altLine|safeAlt|escapeHtml/);
  }
  assert.match(template, /new ClipboardItem\([\s\S]*'text\/html': htmlBlob\.promise[\s\S]*navigator\.clipboard\.write/);
  assert.match(prompt, /new ClipboardItem\([\s\S]*'text\/html'\s*:\s*htmlBlob\.promise[\s\S]*navigator\.clipboard\.write/);
  assert.match(PLACEHOLDER_STYLE, /width:100%;height:var\(--placeholder-height\)/);
  assert.match(placeholderHtml({ alt: "never output" }), /^<span style=/);
  assert.doesNotMatch(placeholderHtml({ alt: "never output" }), /never output|<section/);
});
