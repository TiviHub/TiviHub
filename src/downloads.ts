import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as openFile, remove as removeFile } from "@tauri-apps/plugin-fs";
import type { ContentType } from "./types";

export type DownloadContentType = Extract<ContentType, "MOVIE" | "EPISODE">;

export interface DownloadableMedia {
  id: string;
  playlistId: string;
  contentType: DownloadContentType;
  title: string;
  streamUrl: string;
  artworkUrl?: string;
  parentTitle?: string;
  drmLicenseUrl?: string;
  drmSystem?: string;
}

export interface DownloadRecord {
  id: string;
  mediaId: string;
  playlistId: string;
  contentType: DownloadContentType;
  title: string;
  artworkUrl?: string;
  parentTitle?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  completedAt: number;
  /** Number of stored pieces; absent on downloads saved as one blob by older versions. */
  parts?: number;
}

export interface DownloadProgress {
  id: string;
  title: string;
  receivedBytes: number;
  totalBytes: number | null;
}

export interface DownloadTask extends DownloadProgress {
  media: DownloadableMedia;
  status: "downloading" | "failed";
  error?: string;
}

interface StoredFile {
  id: string;
  blob: Blob;
}

interface DownloadDirectoryHandle {
  name: string;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{
      write(data: Blob): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

interface NativeDownloadDirectory {
  kind: "tauri";
  path: string;
  name: string;
}

interface NativeDownloadDirectoryInfo {
  path: string;
  name: string;
}

type SavedDownloadDirectory = DownloadDirectoryHandle | NativeDownloadDirectory;

interface DownloadDatabase extends DBSchema {
  downloads: { key: string; value: DownloadRecord };
  files: { key: string; value: StoredFile };
  settings: { key: string; value: { key: string; directory: SavedDownloadDirectory } };
}

let databasePromise: Promise<IDBPDatabase<DownloadDatabase>> | null = null;

function getDatabase(): Promise<IDBPDatabase<DownloadDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<DownloadDatabase>("tivihub-downloads", 1, {
      upgrade(database) {
        database.createObjectStore("downloads", { keyPath: "id" });
        database.createObjectStore("files", { keyPath: "id" });
        database.createObjectStore("settings", { keyPath: "key" });
      },
    });
  }
  return databasePromise;
}

const DIRECTORY_SETTING_KEY = "download-directory";
// A download is stored in pieces so only one piece is in memory at a time; the cap protects disk space.
const PART_BYTES = 8 * 1024 ** 2;
const MAX_DOWNLOAD_BYTES = 8 * 1024 ** 3;
const PROGRESS_INTERVAL_MILLIS = 250;
const DIRECT_MEDIA_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov", "ogv", "ogg"]);

export function downloadIdFor(media: Pick<DownloadableMedia, "id" | "playlistId" | "contentType">): string {
  return [media.playlistId, media.contentType, media.id].map(encodeURIComponent).join(":");
}

function mediaExtension(url: string): string | null {
  try {
    return new URL(url).pathname.split(".").pop()?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function canDownloadMedia(media: DownloadableMedia): boolean {
  if (media.drmLicenseUrl || media.drmSystem) return false;
  try {
    const url = new URL(media.streamUrl);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      DIRECT_MEDIA_EXTENSIONS.has(mediaExtension(media.streamUrl) ?? "");
  } catch {
    return false;
  }
}

function safeFileName(title: string, id: string, extension: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
  const clean = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  const safeTitle = clean(title).replace(/[. ]+$/g, "").trim().slice(0, 150);
  // The id keeps two titles that match from overwriting each other's file.
  return `${safeTitle || "video"} [${clean(id).slice(0, 40)}].${extension}`;
}

function mediaTypeFor(extension: string): string {
  if (extension === "webm") return "video/webm";
  if (extension === "ogv" || extension === "ogg") return "video/ogg";
  if (extension === "mov") return "video/quicktime";
  return "video/mp4";
}

// "#" never appears in an id because downloadIdFor percent-encodes its parts.
const partKey = (id: string, index: number) => `${id}#${index}`;
const partRange = (id: string) => IDBKeyRange.bound(`${id}#`, `${id}#￿`);

async function removeParts(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete("files", partRange(id));
}

/** Drops pieces left behind by a download that was interrupted by a crash. Call before any download starts. */
export async function removeOrphanedParts(): Promise<void> {
  const database = await getDatabase();
  const known = new Set(await database.getAllKeys("downloads"));
  const orphans = (await database.getAllKeys("files")).filter((key) => {
    const separator = key.lastIndexOf("#");
    return separator >= 0 && !known.has(key.slice(0, separator));
  });
  await Promise.all(orphans.map((key) => database.delete("files", key)));
}

export async function getDownloads(): Promise<DownloadRecord[]> {
  const database = await getDatabase();
  return (await database.getAll("downloads")).sort((a, b) => b.completedAt - a.completedAt);
}

export async function getDownloadedBlob(id: string): Promise<Blob> {
  const database = await getDatabase();
  const missing = () => new Error("The downloaded video file is missing from local storage.");
  const record = await database.get("downloads", id);
  if (record?.parts === undefined) {
    const stored = await database.get("files", id);
    if (!stored) throw missing();
    return stored.blob;
  }
  const pieces: Blob[] = [];
  for (let index = 0; index < record.parts; index += 1) {
    const stored = await database.get("files", partKey(id, index));
    if (!stored) throw missing();
    pieces.push(stored.blob);
  }
  // Blobs read back from IndexedDB are backed by files, so joining them does not load the video into memory.
  return new Blob(pieces, { type: record.mimeType });
}

export async function removeDownload(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["downloads", "files"], "readwrite");
  await Promise.all([
    transaction.objectStore("downloads").delete(id),
    transaction.objectStore("files").delete(id),
    transaction.objectStore("files").delete(partRange(id)),
  ]);
  await transaction.done;
}

export async function clearCompletedDownloads(): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["downloads", "files"], "readwrite");
  await Promise.all([
    transaction.objectStore("downloads").clear(),
    transaction.objectStore("files").clear(),
  ]);
  await transaction.done;
}

export async function getDownloadDirectoryPath(): Promise<string | null> {
  if (isTauri()) {
    return (await invoke<NativeDownloadDirectoryInfo | null>("saved_download_directory"))?.path ?? null;
  }
  const database = await getDatabase();
  const setting = await database.get("settings", DIRECTORY_SETTING_KEY);
  return setting?.directory.name ?? null;
}

export async function chooseDownloadDirectory(): Promise<string> {
  if (isTauri()) {
    const directory = await invoke<NativeDownloadDirectoryInfo | null>("choose_download_directory");
    if (!directory) throw new DOMException("The folder selection was cancelled.", "AbortError");
    return directory.path;
  }

  const pickerWindow = window as Window & {
    showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<DownloadDirectoryHandle>;
  };
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error("Folder selection is not available in this browser. Downloads will stay in TiviHub storage.");
  }
  const directory = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
  const database = await getDatabase();
  await database.put("settings", { key: DIRECTORY_SETTING_KEY, directory });
  return directory.name;
}

async function writableDownloadDirectory(): Promise<{
  directory?: DownloadDirectoryHandle;
  nativePath?: string;
  error?: Error;
}> {
  if (isTauri()) {
    try {
      const directory = await invoke<NativeDownloadDirectoryInfo | null>("saved_download_directory");
      return directory ? { nativePath: directory.path } : {};
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause : new Error("Could not access the selected download folder."),
      };
    }
  }
  const database = await getDatabase();
  const setting = await database.get("settings", DIRECTORY_SETTING_KEY);
  if (!setting || "kind" in setting.directory) return {};

  try {
    let permission = await setting.directory.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await setting.directory.requestPermission({ mode: "readwrite" });
    }
    return permission === "granted"
      ? { directory: setting.directory }
      : { error: new Error("TiviHub saved the download for offline playback, but permission to copy it to the selected folder was denied.") };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause : new Error("Could not access the selected download folder."),
    };
  }
}

async function saveToChosenDirectory(
  directory: DownloadDirectoryHandle,
  record: DownloadRecord,
  blob: Blob,
): Promise<void> {
  const file = await directory.getFileHandle(record.fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function saveToNativeDirectory(
  directoryPath: string,
  record: DownloadRecord,
  blob: Blob,
): Promise<void> {
  const path = await join(directoryPath, record.fileName);
  const file = await openFile(path, { write: true, create: true, truncate: true });
  try {
    const chunkSize = 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const chunk = await blob.slice(offset, offset + chunkSize).arrayBuffer();
      await file.write(new Uint8Array(chunk));
    }
  } catch (cause) {
    await file.close().catch(() => undefined);
    await removeFile(path).catch(() => undefined);
    throw cause;
  }
  await file.close();
}

function tooLargeError(): Error {
  return new Error("This video is larger than 8 GB, which is too large to save for offline playback.");
}

export async function downloadMedia(
  media: DownloadableMedia,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void,
): Promise<{ record: DownloadRecord; folderError?: Error }> {
  if (!canDownloadMedia(media)) {
    throw new Error("Offline downloads support direct, non-DRM movie and episode files only. HLS streams and protected streams cannot be saved.");
  }

  const extension = mediaExtension(media.streamUrl);
  if (!extension) throw new Error("The video file type could not be determined.");
  const directoryAccess = await writableDownloadDirectory();
  const response = await fetch(media.streamUrl, { signal, cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`The provider could not serve this download (HTTP ${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (
    contentType &&
    (contentType.includes("mpegurl") ||
      contentType.includes("dash") ||
      contentType.includes("json") ||
      contentType.includes("html") ||
      contentType.startsWith("text/"))
  ) {
    throw new Error("This source returned a streaming playlist or a web page instead of a downloadable video file.");
  }

  const totalBytesHeader = Number(response.headers.get("content-length"));
  const totalBytes = Number.isFinite(totalBytesHeader) && totalBytesHeader > 0 ? totalBytesHeader : null;
  if (totalBytes && totalBytes > MAX_DOWNLOAD_BYTES) throw tooLargeError();
  const database = await getDatabase();
  const id = downloadIdFor(media);
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let bufferedBytes = 0;
  let parts = 0;
  let receivedBytes = 0;
  let lastReportAt = 0;
  const reportProgress = () => onProgress({
    id,
    title: media.title,
    receivedBytes,
    totalBytes,
  });
  const flushPart = async () => {
    if (bufferedBytes === 0) return;
    await database.put("files", { id: partKey(id, parts), blob: new Blob(chunks) });
    parts += 1;
    chunks = [];
    bufferedBytes = 0;
  };

  await removeParts(id);
  let record: DownloadRecord;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          if (signal.aborted) throw new DOMException("The download was cancelled.", "AbortError");
          chunks.push(result.value);
          bufferedBytes += result.value.byteLength;
          receivedBytes += result.value.byteLength;
          if (receivedBytes > MAX_DOWNLOAD_BYTES) throw tooLargeError();
          if (bufferedBytes >= PART_BYTES) await flushPart();
          if (Date.now() - lastReportAt >= PROGRESS_INTERVAL_MILLIS) {
            lastReportAt = Date.now();
            reportProgress();
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > MAX_DOWNLOAD_BYTES) throw tooLargeError();
      chunks.push(body);
      bufferedBytes = receivedBytes = body.byteLength;
    }
    reportProgress();

    if (signal.aborted) throw new DOMException("The download was cancelled.", "AbortError");
    if (receivedBytes === 0) throw new Error("The provider returned an empty video file.");
    if (totalBytes && receivedBytes !== totalBytes) {
      throw new Error(`The download ended early (${receivedBytes} of ${totalBytes} bytes). Try again.`);
    }
    await flushPart();
    record = {
      id,
      mediaId: media.id,
      playlistId: media.playlistId,
      contentType: media.contentType,
      title: media.title,
      artworkUrl: media.artworkUrl,
      parentTitle: media.parentTitle,
      fileName: safeFileName(media.title, media.id, extension),
      mimeType: contentType || mediaTypeFor(extension),
      sizeBytes: receivedBytes,
      completedAt: Date.now(),
      parts,
    };
    await database.put("downloads", record);
  } catch (cause) {
    await removeParts(id).catch(() => undefined);
    throw cause;
  }
  return copyToChosenFolder(record, directoryAccess);
}

async function copyToChosenFolder(
  record: DownloadRecord,
  directoryAccess: Awaited<ReturnType<typeof writableDownloadDirectory>>,
): Promise<{ record: DownloadRecord; folderError?: Error }> {
  const blob = await getDownloadedBlob(record.id);
  if (directoryAccess.error) return { record, folderError: directoryAccess.error };
  if (!directoryAccess.directory && !directoryAccess.nativePath) return { record };
  try {
    if (directoryAccess.nativePath) {
      await saveToNativeDirectory(directoryAccess.nativePath, record, blob);
    } else if (directoryAccess.directory) {
      await saveToChosenDirectory(directoryAccess.directory, record, blob);
    }
    return { record };
  } catch (cause) {
    return {
      record,
      folderError: cause instanceof Error ? cause : new Error("Could not copy the download to the selected folder."),
    };
  }
}
