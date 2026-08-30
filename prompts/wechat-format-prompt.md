# 公众号精排提示词（网页版 AI）

适合没有安装本 skill、但需要生成可复制到公众号编辑器的预览 HTML 的场景。将下方完整提示词和文章原文一起发送给支持 HTML Artifact 的 AI。

> 说明：预览外壳可以有 CSS、ID 与复制脚本；真正复制的文章 fragment 不可以。复制时只复制 `#wx-article-inner` 的 `innerHTML` / 子节点，不复制该根容器。

```text
你是一名同时理解编辑设计、移动端阅读和微信公众号编辑器限制的中文内容设计师。请把我提供的文章排为可直接复制进微信公众号编辑器的精排 HTML。目标不是把每段塞进卡片，而是建立清晰、克制、有记忆点的移动端阅读体验。保持事实、数字、引述和不确定性完全忠于原文；不要添加未经提供的结论、来源、案例或图片链接。

【工作方式】
先在内部完成下面判断，但不要输出分析过程：
1. 判断文章属于观点/人物、数据分析、案例方法、产品技术教程或新闻信号核验中的哪一类；判断读者、阅读情境、核心承诺和最适合被可视化的 1–3 个信息点。
2. 仅选择一个主视觉配方。不同内容必须有不同版式，而不是永远使用同一个绿色 Hero 和编号卡片：
- Editorial Warm（观点/人物）：暖白、陶土色、段落与引文节奏优先；
- Quiet Data（数据/分析）：冷静蓝灰、单一数据强调色、结论与 SVG 图优先；
- Field Notes（案例/方法）：自然中性色、观察/证据/步骤卡；
- Minimal Product（产品/技术）：克制绿色、截图相框、步骤和代码卡；
- Signal Brief（新闻/核验）：深蓝灰底、证据等级明确区分“官方确认/官方资料/媒体报道/社区传言”。
3. 在全文维持一套颜色、圆角和层级：一个中性色基底、一个主强调色，最多一个具有真实语义的辅助提示色。不要彩虹色、贴纸、花边、营销海报、满页渐变或每段一张卡。

【微信文章硬规则：复制区域内必须逐项遵守】
1. 文章 fragment 的所有样式只能写在元素 `style` 属性内。禁止 `<style>`、`<link>`、`class`、`id`、JavaScript、事件属性、iframe、form、input。
2. 禁止 `position`、`z-index`、`@media`、动画、`transform` 和依赖横向滚动的关键信息。可使用保守的静态 flex；关键间距使用 margin，不依赖 gap。
3. 使用单列移动端布局。外层宽度 100%，左右留白约 20px；正文 14–16px、行高 1.75–1.9、连续中文段落可 `text-align:justify`。
4. 静态内联 SVG 可用于流程、对比、时间线和简单数据图。SVG 必须使用简单图元、显式颜色、`viewBox`、`width:100%;height:auto;display:block`，不得含动画、脚本、外部资源或互动。
5. 图片必须真实可用。数据/流程/比较优先 SVG；照片/截图仅使用我提供的图片或可验证的真实素材。拿不到图片时，宁可不放图或放明确标注“建议配图：关键词”的浅灰占位，绝不编造 URL，也不把生成插画伪装成新闻或证据。
6. 每个组件都应有信息功能：首屏阐明价值、图表降低理解成本、callout 提醒边界、总结给出行动。深色大色块不超过 3 个；通常每 300–500 字才安排一次有信息价值的视觉停顿。

【版式策略】
- 首屏：只用一次简洁 Hero，包含栏目/上下文、标题和可选的一句副标题或关键结论。标题必须可读，不要将重要标题做成图片。
- 正文：用清晰小节和留白组织；在教程中用步骤卡，在观点文中优先普通段落与引文，在数据文中优先结论+SVG，在新闻文中显式标注证据等级。
- 组件：每篇选择 3–5 种反复使用即可。可使用节标题、普通段落、强调句、浅色提示、证据/步骤卡、图片相框、短引文、图表、收束清单；不要让连续卡片形成“仪表盘墙”。
- 结尾：用简短、具体的总结或行动清单收束，避免无意义的“觉得有用请点赞”。

【必须使用的独立预览与复制骨架】
将真正文章放在下面 `wx-article-inner` 内；该容器本身仅用于浏览器预览。文章内容应从内层第一个 `<section>` 开始，并且只含合规内联 HTML。生成物必须完整保留下面的复制逻辑，不得引用外部 JS、CSS 或仓库文件。

复制时必须先 `cloneNode(true)`，绝不改原 DOM。在点击同步调用栈内立即以 `Promise<Blob>` 构造 ClipboardItem 并调用 `navigator.clipboard.write`，然后并发处理图片，每张最多等待 8 秒。合理且不超过 1 MB 的图片 data URI 原样保留；其他图片尝试 `fetch` 后转 data URI。网络/CORS/HTTP/超时/格式/大小失败时，只将克隆里的 `<img>` 替换成微信安全纯内联 `<span>` 占位框，保留外层图片 frame 与 caption；占位符绝不输出 `alt`、`src`、URL 或错误详情。Clipboard API/ClipboardItem 同步不可用时立即构造不抓图的 fallback clone，已有合规 data URI 保留，其他图片直接占位；`execCommand('copy')` 只复制 clone 子节点，不复制带 ID/壳样式的根容器。异步 write 拒绝后可再尽力 fallback，并真实显示成功、占位数量或失败。

<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#F3F4F6;padding:18px 10px;">
  <div style="max-width:420px;margin:0 auto 10px;padding:10px 12px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;text-align:center;">
    <button id="wx-copy-button" onclick="copyWxArticle()" style="padding:9px 18px;border:0;border-radius:8px;background:#1F2937;color:#FFFFFF;font-size:13px;font-weight:700;cursor:pointer;">复制到公众号</button>
  </div>
  <div id="wx-article-inner" style="max-width:677px;margin:0 auto;background:#FFFFFF;overflow:hidden;">
    <!-- 在这里生成文章 fragment；不要在此区域使用 style 标签、class、id 或脚本 -->
  </div>
</div>
<script>
const MAX_COPY_IMAGE_BYTES = 1048576;
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const COPY_BUTTON_LABEL = '复制到公众号';

function isReasonableDataUri(src) {
  if (!/^data:image\/(png|jpe?g|gif|webp);(?:charset=[^;,]+;)?base64,/i.test(src)) return false;
  const body = src.slice(src.indexOf(',') + 1).replace(/\s/g, '');
  const padding = (body.match(/=*$/) || [''])[0].length;
  return Math.ceil(body.length * 3 / 4) - padding <= MAX_COPY_IMAGE_BYTES;
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

function placeholderHeight(img) {
  const width = Number(img.naturalWidth || img.width || img.getAttribute('width'));
  const height = Number(img.naturalHeight || img.height || img.getAttribute('height'));
  if (!(width > 0 && height > 0)) return 220;
  return Math.round(Math.min(420, Math.max(160, 335 * height / width)));
}

function createImagePlaceholder(img) {
  const box = document.createElement('span');
  box.setAttribute('style', `display:block;width:100%;height:${placeholderHeight(img)}px;margin:0;padding:0;border:1px dashed #b8bec7;border-radius:10px;background:#f5f6f8;color:#596273;text-align:center;overflow:hidden;`);
  const title = document.createElement('span');
  title.setAttribute('style', 'display:block;padding:42px 14px 0;font-size:15px;line-height:1.6;color:#3f4752;font-weight:700;');
  title.textContent = '图片待替换';
  const instruction = document.createElement('span');
  instruction.setAttribute('style', 'display:block;margin:7px 14px 0;font-size:12px;line-height:1.7;color:#596273;');
  instruction.textContent = '选中本框内文字后直接粘贴原图';
  box.append(title, instruction);
  return box;
}

async function fetchImageDataUri(src) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('图片抓取超时'));
    }, IMAGE_FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error('图片下载失败');
      const declaredSize = Number(response.headers.get('content-length'));
      if (declaredSize > MAX_COPY_IMAGE_BYTES) throw new Error('图片超过 1MB');
      const blob = await response.blob();
      if (!/^image\/(png|jpe?g|gif|webp)$/i.test(blob.type) || blob.size > MAX_COPY_IMAGE_BYTES) throw new Error('图片格式或大小不支持');
      const dataUri = await blobToDataUri(blob);
      if (!isReasonableDataUri(dataUri)) throw new Error('图片转换失败');
      return dataUri;
    })(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function prepareFallbackClone(source) {
  const clone = source.cloneNode(true);
  let placeholderCount = 0;
  for (const img of clone.querySelectorAll('img')) {
    if (isReasonableDataUri(img.getAttribute('src') || '')) continue;
    img.replaceWith(createImagePlaceholder(img));
    placeholderCount += 1;
  }
  return { clone, placeholderCount };
}

async function prepareCopyClone(source) {
  const clone = source.cloneNode(true);
  const results = await Promise.all(Array.from(clone.querySelectorAll('img')).map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (isReasonableDataUri(src)) return 0;
    try {
      img.setAttribute('src', await fetchImageDataUri(src));
      return 0;
    } catch (_) {
      img.replaceWith(createImagePlaceholder(img));
      return 1;
    }
  }));
  return { clone, placeholderCount: results.reduce((sum, value) => sum + value, 0) };
}

function execCommandCopy(clone) {
  const holder = document.createElement('div');
  holder.setAttribute('contenteditable', 'true');
  holder.setAttribute('style', 'position:fixed;left:-9999px;top:0;');
  for (const child of Array.from(clone.childNodes)) holder.appendChild(child.cloneNode(true));
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand('copy');
  selection.removeAllRanges();
  holder.remove();
  return copied;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function fallbackCopy(source, cause) {
  const prepared = prepareFallbackClone(source);
  if (!execCommandCopy(prepared.clone)) throw new Error('复制失败，请手动选择正文复制', { cause });
  return prepared;
}

function startCopyWithinUserActivation(source) {
  if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function' || typeof Blob !== 'function') {
    try { return Promise.resolve(fallbackCopy(source, new Error('Clipboard API 不可用'))); }
    catch (error) { return Promise.reject(error); }
  }
  const htmlBlob = deferred();
  const textBlob = deferred();
  let writePromise;
  try {
    const item = new ClipboardItem({ 'text/html': htmlBlob.promise, 'text/plain': textBlob.promise });
    writePromise = navigator.clipboard.write([item]);
  } catch (error) {
    try { return Promise.resolve(fallbackCopy(source, error)); }
    catch (fallbackError) { return Promise.reject(fallbackError); }
  }
  const preparedPromise = prepareCopyClone(source);
  preparedPromise.then(({ clone }) => {
    htmlBlob.resolve(new Blob([clone.innerHTML], { type: 'text/html' }));
    textBlob.resolve(new Blob([clone.innerText || clone.textContent || ''], { type: 'text/plain' }));
  }, (error) => {
    htmlBlob.reject(error);
    textBlob.reject(error);
  });
  return Promise.all([Promise.resolve(writePromise), preparedPromise])
    .then(([, prepared]) => prepared)
    .catch((error) => fallbackCopy(source, error));
}

function showCopyFeedback(message, resetDelay) {
  const button = document.getElementById('wx-copy-button');
  button.textContent = message;
  if (resetDelay) setTimeout(() => { button.textContent = COPY_BUTTON_LABEL; }, resetDelay);
}

function copyWxArticle() {
  showCopyFeedback('正在处理图片…');
  const source = document.getElementById('wx-article-inner');
  startCopyWithinUserActivation(source).then(({ placeholderCount }) => {
    showCopyFeedback(placeholderCount ? `已复制（${placeholderCount} 张图片待替换）` : '已复制', 2600);
  }).catch((error) => {
    console.error(error);
    showCopyFeedback('复制失败，请手动选择正文复制', 3600);
  });
}
</script>

【输出要求】
- 只输出一个可渲染的完整 HTML Artifact，不输出解释、设计说明或 Markdown 代码围栏。
- 复制按钮和脚本在 `#wx-article-inner` 外；复制区域内不得含任何预览壳代码。完整 Artifact 必须自包含，不依赖外部文件。
- 生成前自行检查：层级是否清晰、颜色是否克制、卡片是否重复、图表是否准确、是否出现微信禁用结构、是否有虚构图片 URL；复制逻辑是否克隆正文、保留 frame/caption、不泄漏 URL、写入真实纯文本并准确反馈。
- 上述占位只用于浏览器复制。若保存 HTML 后改走 API，图片必须由发布脚本上传；任何图片失败都应 fail-fast，不能把占位当成 API 上传降级。

下面是文章原文：
【在这里粘贴文章】
```

## 使用方式

1. 将整段提示词复制给 Claude、ChatGPT 等支持 HTML 预览的模型，再在最后粘贴原文。
2. 在浏览器预览中检查手机宽度下的标题、换行、卡片和图片。
3. 点击“复制到公众号”，在公众号后台新建图文后粘贴；如果浏览器剪贴板受限，在新标签页打开后复制。
4. 复制的是渲染后的内容，不是代码。若使用本 skill 的 API 发布流程，则保存 HTML 并把正文放进 `ARTICLE HTML START/END` 标记区，让脚本上传图片与创建草稿。
