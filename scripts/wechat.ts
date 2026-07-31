import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const UPLOADIMG_URL = "https://api.weixin.qq.com/cgi-bin/media/uploadimg";
const ADD_MATERIAL_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_ADD_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";
const FREEPUBLISH_SUBMIT_URL = "https://api.weixin.qq.com/cgi-bin/freepublish/submit";
const FREEPUBLISH_GET_URL = "https://api.weixin.qq.com/cgi-bin/freepublish/get";

interface WxError {
  errcode?: number;
  errmsg?: string;
}

function check<T extends WxError>(data: T, what: string): T {
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat ${what} failed: errcode=${data.errcode} errmsg=${data.errmsg}`);
  }
  return data;
}

export async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as WxError & { access_token?: string };
  check(data, "token");
  if (!data.access_token) throw new Error("WeChat token response missing access_token");
  return data.access_token;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

async function fileToBlob(path: string): Promise<{ blob: Blob; name: string; size: number }> {
  const buf = await readFile(path);
  const ext = (path.split(".").pop() || "png").toLowerCase();
  const name = basename(path);
  return { blob: new Blob([buf], { type: MIME[ext] || "image/png" }), name, size: buf.length };
}

// Upload an in-article image. Returns a WeChat-hosted URL. Limit: 1MB, jpg/png only.
export async function uploadBodyImage(path: string, accessToken: string): Promise<string> {
  const { blob, name, size } = await fileToBlob(path);
  if (size > 1024 * 1024) {
    throw new Error(`Body image too large (${(size / 1024 / 1024).toFixed(2)}MB > 1MB): ${path}`);
  }
  const form = new FormData();
  form.append("media", blob, name);
  const res = await fetch(`${UPLOADIMG_URL}?access_token=${accessToken}`, { method: "POST", body: form });
  const data = (await res.json()) as WxError & { url?: string };
  check(data, "uploadimg");
  if (!data.url) throw new Error("WeChat uploadimg response missing url");
  return data.url;
}

// Upload a permanent image material. Returns media_id (used as article cover thumb).
export async function uploadCoverMaterial(path: string, accessToken: string): Promise<string> {
  const { blob, name, size } = await fileToBlob(path);
  if (size > 10 * 1024 * 1024) {
    throw new Error(`Cover image too large (${(size / 1024 / 1024).toFixed(2)}MB > 10MB): ${path}`);
  }
  const form = new FormData();
  form.append("media", blob, name);
  const res = await fetch(`${ADD_MATERIAL_URL}?access_token=${accessToken}&type=image`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as WxError & { media_id?: string };
  check(data, "add_material");
  if (!data.media_id) throw new Error("WeChat add_material response missing media_id");
  return data.media_id;
}

export interface DraftArticle {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  thumbMediaId: string;
  contentSourceUrl?: string;
  needOpenComment?: number;
  onlyFansCanComment?: number;
}

// Create a draft in the Official Account draft box. Returns media_id of the draft.
export async function addDraft(article: DraftArticle, accessToken: string): Promise<string> {
  const body = {
    articles: [
      {
        article_type: "news",
        title: article.title.slice(0, 64),
        author: article.author || "",
        digest: (article.digest || "").slice(0, 120),
        content: article.content,
        content_source_url: article.contentSourceUrl || "",
        thumb_media_id: article.thumbMediaId,
        need_open_comment: article.needOpenComment ?? 1,
        only_fans_can_comment: article.onlyFansCanComment ?? 0,
      },
    ],
  };
  const res = await fetch(`${DRAFT_ADD_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as WxError & { media_id?: string };
  check(data, "draft/add");
  if (!data.media_id) throw new Error("WeChat draft/add response missing media_id");
  return data.media_id;
}

// ─── Draft management ───────────────────────────────────────────────

const DRAFT_BATCHGET_URL = "https://api.weixin.qq.com/cgi-bin/draft/batchget";
const DRAFT_UPDATE_URL = "https://api.weixin.qq.com/cgi-bin/draft/update";
const DRAFT_DELETE_URL = "https://api.weixin.qq.com/cgi-bin/draft/delete";

export interface DraftNewsItem {
  title: string;
  author: string;
  digest: string;
  content: string;
  thumb_media_id: string;
  update_time: number;
}

export interface DraftItem {
  media_id: string;
  content: {
    news_item: DraftNewsItem[];
  };
  update_time: number;
}

export interface DraftListResult {
  total_count: number;
  item_count: number;
  item: DraftItem[];
}

// List drafts. Returns total count and items (with content by default).
export async function getDrafts(
  offset: number,
  count: number,
  noContent: boolean,
  accessToken: string,
): Promise<DraftListResult> {
  const res = await fetch(`${DRAFT_BATCHGET_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset, count, no_content: noContent ? 1 : 0 }),
  });
  const data = (await res.json()) as WxError & DraftListResult;
  check(data, "draft/batchget");
  return { total_count: data.total_count, item_count: data.item_count, item: data.item ?? [] };
}

// Update a single article within a draft. Only provided fields are overwritten.
export async function updateDraft(
  mediaId: string,
  index: number,
  article: Partial<DraftArticle>,
  accessToken: string,
): Promise<void> {
  const articles: Record<string, unknown> = {};
  if (article.title !== undefined) articles.title = article.title.slice(0, 64);
  if (article.author !== undefined) articles.author = article.author;
  if (article.digest !== undefined) articles.digest = article.digest.slice(0, 120);
  if (article.content !== undefined) articles.content = article.content;
  if (article.thumbMediaId !== undefined) articles.thumb_media_id = article.thumbMediaId;
  if (article.contentSourceUrl !== undefined) articles.content_source_url = article.contentSourceUrl;
  if (article.needOpenComment !== undefined) articles.need_open_comment = article.needOpenComment;
  if (article.onlyFansCanComment !== undefined) articles.only_fans_can_comment = article.onlyFansCanComment;

  const body = { media_id: mediaId, index, articles };
  const res = await fetch(`${DRAFT_UPDATE_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as WxError;
  check(data, "draft/update");
}

// Delete a draft by media_id.
export async function deleteDraft(mediaId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRAFT_DELETE_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = (await res.json()) as WxError;
  check(data, "draft/delete");
}

export interface PublishStatus {
  publishId: string;
  publishStatus: number;
  articleId?: string;
  articleDetail?: unknown;
  failIdx?: number[];
}

// Submit an existing draft for official publication. This is asynchronous: queryPublishStatus before reporting success.
export async function submitFreePublish(mediaId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${FREEPUBLISH_SUBMIT_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = (await res.json()) as WxError & { publish_id?: string };
  check(data, "freepublish/submit");
  if (!data.publish_id) throw new Error("WeChat freepublish/submit response missing publish_id");
  return data.publish_id;
}

// Query the asynchronous result returned by freepublish/submit.
export async function getFreePublishStatus(publishId: string, accessToken: string): Promise<PublishStatus> {
  const res = await fetch(`${FREEPUBLISH_GET_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = (await res.json()) as WxError & {
    publish_id?: string;
    publish_status?: number;
    article_id?: string;
    article_detail?: unknown;
    fail_idx?: number[];
  };
  check(data, "freepublish/get");
  if (data.publish_status === undefined) throw new Error("WeChat freepublish/get response missing publish_status");
  return {
    publishId: data.publish_id || publishId,
    publishStatus: data.publish_status,
    articleId: data.article_id,
    articleDetail: data.article_detail,
    failIdx: data.fail_idx,
  };
}
