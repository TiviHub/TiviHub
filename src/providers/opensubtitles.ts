import { recordDiagnosticFailure } from "../lib/diagnosticLog";
import { t } from "../lib/i18n";

// Checked with instanceof: the message is translated, so it cannot be compared as text.
class SubtitleRequestError extends Error {}
class SubtitleTooLargeError extends Error {}
import type { OpenSubtitleSearchResult } from "../types";

export type SubtitleResult = OpenSubtitleSearchResult;

interface DownloadDetails {
  link?: unknown;
  file_name?: unknown;
}

const API_BASE = "https://api.opensubtitles.com/api/v1";
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
export const OPENSUBTITLES_REQUEST_TIMEOUT_MILLIS = 20_000;

function withRequestTimeout<T>(
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      recordDiagnosticFailure("subtitle-search", "network");
      reject(new Error(t("err.osTimeout")));
      controller.abort();
    }, OPENSUBTITLES_REQUEST_TIMEOUT_MILLIS);
  });
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  });
}

async function request(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  if (!apiKey.trim()) throw new Error(t("err.osNoKey"));
  try {
    const response = await fetch(url, {
      ...init,
      signal,
      headers: {
        ...init.headers,
        "Api-Key": apiKey.trim(),
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      recordDiagnosticFailure("subtitle-search", "http", response.status);
      throw new SubtitleRequestError(t("err.osHttp", { status: response.status }));
    }
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof SubtitleRequestError) throw error;
    recordDiagnosticFailure("subtitle-search", "network");
    throw new Error(
      t("err.osNetwork"),
      { cause: error },
    );
  }
}

export function searchOpenSubtitles(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SubtitleResult[]> {
  return withRequestTimeout(signal, (requestSignal) => searchOpenSubtitlesRequest(apiKey, query, requestSignal));
}

async function searchOpenSubtitlesRequest(
  apiKey: string,
  query: string,
  signal: AbortSignal,
): Promise<SubtitleResult[]> {
  if (!query.trim()) throw new Error(t("err.osNoQuery"));
  const url = new URL(`${API_BASE}/subtitles`);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("order_by", "download_count");
  url.searchParams.set("order_direction", "desc");
  const response = await request(url.toString(), apiKey, signal);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    recordDiagnosticFailure("subtitle-search", "invalid-response");
    throw new Error(t("err.osInvalidResults"));
  }
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { data?: unknown }).data;
  if (!Array.isArray(results)) return [];

  return results.flatMap((result): SubtitleResult[] => {
    if (!result || typeof result !== "object") return [];
    const attributes = (result as { attributes?: unknown }).attributes;
    if (!attributes || typeof attributes !== "object") return [];
    const value = attributes as {
      language?: unknown;
      release?: unknown;
      download_count?: unknown;
      files?: unknown;
    };
    if (!Array.isArray(value.files)) return [];
    return value.files.flatMap((file): SubtitleResult[] => {
      if (!file || typeof file !== "object") return [];
      const info = file as { file_id?: unknown; file_name?: unknown };
      const fileId = Number(info.file_id);
      const fileName = typeof info.file_name === "string" ? info.file_name : "";
      if (
        !Number.isSafeInteger(fileId) ||
        fileId <= 0 ||
        !fileName.trim() ||
        /\.(zip|rar|7z|idx|sub|ass|ssa)$/i.test(fileName)
      ) return [];
      return [{
        fileId,
        fileName,
        language: typeof value.language === "string" ? value.language : "und",
        release: typeof value.release === "string" ? value.release : undefined,
        downloadCount: Number(value.download_count) || 0,
      }];
    });
  });
}

export function downloadOpenSubtitle(
  apiKey: string,
  fileId: number,
  signal?: AbortSignal,
): Promise<{ name: string; contents: string }> {
  return withRequestTimeout(signal, (requestSignal) => downloadOpenSubtitleRequest(apiKey, fileId, requestSignal));
}

async function downloadOpenSubtitleRequest(
  apiKey: string,
  fileId: number,
  signal: AbortSignal,
): Promise<{ name: string; contents: string }> {
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error(t("err.osBadId"));
  }
  const downloadRequest = await request(`${API_BASE}/download`, apiKey, signal, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  let value: unknown;
  try {
    value = await downloadRequest.json();
  } catch {
    recordDiagnosticFailure("subtitle-download", "invalid-response");
    throw new Error(t("err.osInvalidDownload"));
  }
  if (!value || typeof value !== "object") throw new Error(t("err.osInvalidDownload"));
  const details = value as DownloadDetails;
  if (typeof details.link !== "string") {
    throw new Error(t("err.osNoLink"));
  }
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(details.link);
  } catch {
    throw new Error(t("err.osNoLink"));
  }
  if (downloadUrl.protocol !== "https:" || !downloadUrl.hostname || downloadUrl.username || downloadUrl.password) {
    throw new Error(t("err.osNoLink"));
  }
  const file = await fetch(downloadUrl, { signal }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    recordDiagnosticFailure("subtitle-download", "network");
    throw new Error(t("err.osBlocked"));
  });
  if (!file.ok) {
    recordDiagnosticFailure("subtitle-download", "http", file.status);
    throw new Error(t("err.osDlHttp", { status: file.status }));
  }
  if (!file.body) throw new Error(t("err.osEmpty"));
  const declaredSize = Number(file.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SUBTITLE_BYTES) {
    throw new SubtitleTooLargeError(t("err.osTooLarge"));
  }
  const reader = file.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_SUBTITLE_BYTES) {
        await reader.cancel();
        throw new SubtitleTooLargeError(t("err.osTooLarge"));
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof SubtitleTooLargeError) throw error;
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    throw new Error(t("err.osInterrupted"), { cause: error });
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contents = new TextDecoder().decode(buffer);
  if (!contents.trim() || /^<!DOCTYPE|^<html/i.test(contents.trim())) {
    throw new Error(t("err.osInvalidFile"));
  }
  return {
    name: typeof details.file_name === "string" ? details.file_name : `subtitle-${fileId}.srt`,
    contents,
  };
}
