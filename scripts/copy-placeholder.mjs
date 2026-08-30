export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_FETCH_TIMEOUT_MS = 8000;
export const PLACEHOLDER_STYLE = "display:block;width:100%;height:var(--placeholder-height);margin:0;padding:0;border:1px dashed #b8bec7;border-radius:10px;background:#f5f6f8;color:#596273;text-align:center;overflow:hidden;";

function dataUriBytes(src) {
  const comma = src.indexOf(",");
  if (comma < 0) return Infinity;
  const body = src.slice(comma + 1).replace(/\s/g, "");
  return Math.ceil(body.length * 3 / 4) - ((body.match(/=*$/) || [""])[0].length);
}

export function isReasonableImageDataUri(src, maxBytes = MAX_IMAGE_BYTES) {
  return /^data:image\/(?:png|jpe?g|gif|webp);(?:charset=[^;,]+;)?base64,/i.test(src)
    && dataUriBytes(src) <= maxBytes;
}

export function imageHeight(image) {
  const width = Number(image.naturalWidth || image.width || image.getAttribute?.("width"));
  const height = Number(image.naturalHeight || image.height || image.getAttribute?.("height"));
  if (!(width > 0 && height > 0)) return 220;
  return Math.round(Math.min(420, Math.max(160, 335 * height / width)));
}

export function placeholderHtml(image) {
  const style = PLACEHOLDER_STYLE.replace("var(--placeholder-height)", `${imageHeight(image)}px`);
  return `<span style="${style}"><span style="display:block;padding:42px 14px 0;font-size:15px;line-height:1.6;color:#3f4752;font-weight:700;">图片待替换</span><span style="display:block;margin:7px 14px 0;font-size:12px;line-height:1.7;color:#596273;">选中本框内文字后直接粘贴原图</span></span>`;
}

function timeoutError(timeoutMs) {
  return new Error(`Image fetch timed out after ${timeoutMs} ms`);
}

export async function fetchImageAsDataUri(src, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? IMAGE_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = options.AbortControllerCtor === null
    ? null
    : new (options.AbortControllerCtor ?? globalThis.AbortController)();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(timeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(src, controller ? { signal: controller.signal } : undefined);
      if (!response?.ok) throw new Error(`Image fetch failed (${response?.status || "network"})`);
      const declared = Number(response.headers?.get?.("content-length"));
      if (declared > maxBytes) throw new Error("Image exceeds 1 MB");
      const blob = await response.blob();
      if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(blob.type) || blob.size > maxBytes) {
        throw new Error("Image type or size is not supported");
      }
      if (options.blobToDataUri) return options.blobToDataUri(blob);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Could not read image"));
        reader.readAsDataURL(blob);
      });
    })(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function replaceWithPlaceholder(image) {
  image.outerHTML = placeholderHtml(image);
}

export function prepareFallbackClone(article, options = {}) {
  const clone = article.cloneNode(true);
  let placeholderCount = 0;
  for (const image of Array.from(clone.querySelectorAll("img"))) {
    const src = image.getAttribute?.("src") || image.src || "";
    if (isReasonableImageDataUri(src, options.maxBytes)) continue;
    replaceWithPlaceholder(image);
    placeholderCount += 1;
  }
  return { clone, placeholderCount };
}

export async function prepareArticleClone(article, options = {}) {
  const clone = article.cloneNode(true);
  const images = Array.from(clone.querySelectorAll("img"));
  const results = await Promise.all(images.map(async (image) => {
    const src = image.getAttribute?.("src") || image.src || "";
    if (isReasonableImageDataUri(src, options.maxBytes)) return 0;
    try {
      const dataUri = await fetchImageAsDataUri(src, options);
      if (!isReasonableImageDataUri(dataUri, options.maxBytes)) throw new Error("Invalid data URI");
      image.setAttribute("src", dataUri);
      return 0;
    } catch {
      replaceWithPlaceholder(image);
      return 1;
    }
  }));
  return { clone, placeholderCount: results.reduce((sum, value) => sum + value, 0) };
}

export function cloneChildrenInto(holder, clone) {
  for (const child of Array.from(clone.childNodes || [])) holder.appendChild(child.cloneNode(true));
  return holder;
}

export function copyFeedback(placeholderCount) {
  return placeholderCount > 0 ? `已复制（${placeholderCount} 张图片待替换）` : "已复制";
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function fallbackResult(article, options, cause) {
  const prepared = prepareFallbackClone(article, options);
  if (!options.execCommandCopy?.(prepared.clone)) {
    throw new Error("复制失败，请手动选择正文复制", { cause });
  }
  return { method: "execCommand", ...prepared };
}

function startFallback(article, options, cause) {
  try {
    return { mode: "execCommand", completion: Promise.resolve(fallbackResult(article, options, cause)) };
  } catch (error) {
    return { mode: "execCommand", completion: Promise.reject(error) };
  }
}

export function startClipboardCopy(article, options = {}) {
  const clipboard = Object.hasOwn(options, "clipboard") ? options.clipboard : globalThis.navigator?.clipboard;
  const ClipboardItemCtor = Object.hasOwn(options, "ClipboardItemCtor") ? options.ClipboardItemCtor : globalThis.ClipboardItem;
  const BlobCtor = Object.hasOwn(options, "BlobCtor") ? options.BlobCtor : globalThis.Blob;
  if (!clipboard?.write || !ClipboardItemCtor || !BlobCtor) {
    return startFallback(article, options, new Error("Clipboard API unavailable"));
  }

  const htmlBlob = deferred();
  const textBlob = deferred();
  let writePromise;
  try {
    const item = new ClipboardItemCtor({ "text/html": htmlBlob.promise, "text/plain": textBlob.promise });
    writePromise = clipboard.write([item]);
  } catch (error) {
    return startFallback(article, options, error);
  }

  const preparedPromise = prepareArticleClone(article, options);
  preparedPromise.then(({ clone }) => {
    htmlBlob.resolve(new BlobCtor([clone.innerHTML], { type: "text/html" }));
    textBlob.resolve(new BlobCtor([clone.innerText || clone.textContent || ""], { type: "text/plain" }));
  }, (error) => {
    htmlBlob.reject(error);
    textBlob.reject(error);
  });

  const completion = Promise.all([Promise.resolve(writePromise), preparedPromise])
    .then(([, prepared]) => ({ method: "clipboard", ...prepared }))
    .catch((error) => fallbackResult(article, options, error));
  return { mode: "clipboard", completion };
}
