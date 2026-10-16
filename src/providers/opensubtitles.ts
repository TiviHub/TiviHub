export interface SubtitleResult {
  fileId: number;
  fileName: string;
  language: string;
  release?: string;
  downloadCount: number;
}

interface DownloadDetails {
  link?: unknown;
  file_name?: unknown;
}

const API_BASE = "https://api.opensubtitles.com/api/v1";
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

async function request(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  if (!apiKey.trim()) throw new Error("Add an OpenSubtitles API key in Settings first.");
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
    if (!response.ok) throw new Error(`OpenSubtitles request failed with HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.message.startsWith("OpenSubtitles request failed")) throw error;
    throw new Error(
      "OpenSubtitles could not be reached from TiviHub. Check your API key and cross-origin access.",
    );
  }
}

export async function searchOpenSubtitles(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SubtitleResult[]> {
  if (!query.trim()) throw new Error("Enter a movie or episode title to search.");
  const url = new URL(`${API_BASE}/subtitles`);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("order_by", "download_count");
  url.searchParams.set("order_direction", "desc");
  const response = await request(url.toString(), apiKey, signal);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("OpenSubtitles returned invalid search results.");
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
      if (!Number.isSafeInteger(fileId) || fileId <= 0 || !/\.(srt|vtt)$/i.test(fileName)) return [];
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

export async function downloadOpenSubtitle(
  apiKey: string,
  fileId: number,
  signal?: AbortSignal,
): Promise<{ name: string; contents: string }> {
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error("OpenSubtitles file ID is invalid.");
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
    throw new Error("OpenSubtitles returned invalid download details.");
  }
  if (!value || typeof value !== "object") throw new Error("OpenSubtitles returned invalid download details.");
  const details = value as DownloadDetails;
  if (typeof details.link !== "string") {
    throw new Error("OpenSubtitles did not provide a secure download link.");
  }
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(details.link);
  } catch {
    throw new Error("OpenSubtitles did not provide a secure download link.");
  }
  if (downloadUrl.protocol !== "https:" || !downloadUrl.hostname || downloadUrl.username || downloadUrl.password) {
    throw new Error("OpenSubtitles did not provide a secure download link.");
  }
  const file = await fetch(downloadUrl, { signal }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Subtitle download is blocked by cross-origin access from this app. Import a subtitle file instead.");
  });
  if (!file.ok) throw new Error(`Subtitle download failed with HTTP ${file.status}.`);
  if (!file.body) throw new Error("Subtitle provider returned an empty file.");
  const declaredSize = Number(file.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SUBTITLE_BYTES) {
    throw new Error("Subtitle file exceeds the 5 MB limit.");
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
        throw new Error("Subtitle file exceeds the 5 MB limit.");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Subtitle file exceeds the 5 MB limit.") throw error;
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    throw new Error("Subtitle download was interrupted.");
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
    throw new Error("The subtitle provider returned an invalid file.");
  }
  return {
    name: typeof details.file_name === "string" ? details.file_name : `subtitle-${fileId}.srt`,
    contents,
  };
}
