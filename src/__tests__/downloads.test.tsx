// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  canDownloadMedia,
  clearCompletedDownloads,
  chooseDownloadDirectory,
  downloadIdFor,
  downloadMedia,
  getDownloadedBlob,
  getDownloads,
  type DownloadableMedia,
  type DownloadTask,
} from "../downloads";
import { DownloadsPage } from "../components/DownloadsPage";

const media: DownloadableMedia = {
  id: "movie-1",
  playlistId: "source-1",
  contentType: "MOVIE",
  title: "Sample movie",
  streamUrl: "https://media.example/sample.mp4",
};

async function clearDownloadDirectorySetting() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tivihub-downloads");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").delete("download-directory");
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

beforeEach(async () => {
  vi.stubGlobal("Blob", window.Blob);
  await clearCompletedDownloads();
  await clearDownloadDirectorySetting();
});

afterEach(async () => {
  cleanup();
  await clearDownloadDirectorySetting();
  vi.unstubAllGlobals();
});

describe("offline downloads", () => {
  it("allows direct non-DRM video files and rejects playlists and protected streams", () => {
    expect(canDownloadMedia(media)).toBe(true);
    expect(canDownloadMedia({ ...media, streamUrl: "https://media.example/sample.m3u8" })).toBe(false);
    expect(canDownloadMedia({ ...media, drmLicenseUrl: "https://license.example/widevine" })).toBe(false);
  });

  it("uses the native desktop picker and writes a copy to the selected folder", async () => {
    const directoryPath = "C:\\Users\\Test\\Downloads";
    const invoke = vi.fn(async (command: string, args?: { data?: Uint8Array }) => {
      if (command === "plugin:path|resolve_directory") return directoryPath;
      if (command === "choose_download_directory" || command === "saved_download_directory") {
        return { path: directoryPath, name: "Downloads" };
      }
      if (command === "plugin:path|join") return `${directoryPath}\\Sample movie [movie-1].mp4`;
      if (command === "plugin:fs|open") return 1;
      if (command === "plugin:fs|write") return args?.data?.byteLength ?? 0;
      return undefined;
    });
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" },
    })));

    expect(await chooseDownloadDirectory()).toBe(directoryPath);
    const { folderError } = await downloadMedia(media, new AbortController().signal, vi.fn());

    expect(folderError).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("choose_download_directory", {}, undefined);
    expect(invoke).toHaveBeenCalledWith(
      "plugin:fs|open",
      expect.objectContaining({ path: `${directoryPath}\\Sample movie [movie-1].mp4` }),
      undefined,
    );
    expect(invoke).toHaveBeenCalledWith(
      "plugin:fs|write",
      expect.objectContaining({ rid: 1, data: expect.any(Uint8Array) }),
      undefined,
    );
  });

  it("stores a downloaded video for offline playback without persisting its source URL", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength) },
    })));
    const onProgress = vi.fn();

    const { record } = await downloadMedia(media, new AbortController().signal, onProgress);

    expect(record).toMatchObject({
      id: downloadIdFor(media),
      title: media.title,
      fileName: "Sample movie [movie-1].mp4",
      sizeBytes: 4,
    });
    expect(record).not.toHaveProperty("streamUrl");
    expect(onProgress).toHaveBeenCalledWith({
      id: downloadIdFor(media),
      title: media.title,
      receivedBytes: 4,
      totalBytes: 4,
    });
    expect(await getDownloadedBlob(record.id)).toBeTruthy();
    expect(await getDownloads()).toEqual([record]);
  });

  it("rejects a download that ends before content-length and keeps nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2]), {
      headers: { "content-type": "video/mp4", "content-length": "10" },
    })));

    await expect(downloadMedia(media, new AbortController().signal, vi.fn()))
      .rejects.toThrow("ended early");
    expect(await getDownloads()).toEqual([]);
  });

  it("refuses files larger than the offline storage limit before reading the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: { "content-type": "video/mp4", "content-length": String(3 * 1024 ** 3) },
    })));

    await expect(downloadMedia(media, new AbortController().signal, vi.fn()))
      .rejects.toThrow("larger than 1 GB");
    expect(await getDownloads()).toEqual([]);
  });

  it("stops without saving when the download is cancelled mid-stream", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        stream.enqueue(new Uint8Array([1, 2, 3]));
        controller.abort();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": "video/mp4" } })));

    await expect(downloadMedia(media, controller.signal, vi.fn()))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(await getDownloads()).toEqual([]);
  });

  it("gives titles that match different file names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } })));
    const first = await downloadMedia(media, new AbortController().signal, vi.fn());
    const second = await downloadMedia({ ...media, id: "movie-2" }, new AbortController().signal, vi.fn());

    expect(first.record.fileName).not.toBe(second.record.fileName);
  });

  it("rejects playlist responses instead of saving them as video files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("#EXTM3U", {
      status: 200,
      headers: { "content-type": "application/vnd.apple.mpegurl" },
    })));

    await expect(downloadMedia(media, new AbortController().signal, vi.fn()))
      .rejects.toThrow("streaming playlist");
    expect(await getDownloads()).toEqual([]);
  });

  it("removes the stored file when completed downloads are cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    })));
    const { record } = await downloadMedia(media, new AbortController().signal, vi.fn());

    await clearCompletedDownloads();

    expect(await getDownloads()).toEqual([]);
    await expect(getDownloadedBlob(record.id)).rejects.toThrow("missing");
  });

  it("shows the add-source panel when no playlist exists", () => {
    render(
      <DownloadsPage
        downloads={[]}
        tasks={[]}
        loading={false}
        sourceCount={0}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
        onRemoveFailed={vi.fn()}
        onRetry={vi.fn()}
        onPlay={vi.fn()}
        onAddPlaylist={vi.fn()}
        onBrowseMovies={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add your first source" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Downloads" })).toBeNull();
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(document.querySelector(".downloads-page")).toBeNull();
    expect(screen.getByRole("button", { name: /Add source/ })).toBeTruthy();
    expect(document.querySelector(".home-empty-source-types")?.getAttribute("aria-label")).toBe("Supported source types");
  });

  it("uses the same empty panel when a playlist exists but no videos are downloaded", () => {
    const onBrowseMovies = vi.fn();
    render(
      <DownloadsPage
        downloads={[]}
        tasks={[]}
        loading={false}
        sourceCount={1}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
        onRemoveFailed={vi.fn()}
        onRetry={vi.fn()}
        onPlay={vi.fn()}
        onAddPlaylist={vi.fn()}
        onBrowseMovies={onBrowseMovies}
      />,
    );

    expect(screen.getByRole("heading", { name: "No downloads yet" })).toBeTruthy();
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(document.querySelector(".downloads-page")).toBeNull();
    expect(document.querySelector(".home-empty-source-types")).toBeNull();
    screen.getByRole("button", { name: "Browse movies" }).click();
    expect(onBrowseMovies).toHaveBeenCalledOnce();
  });

  it("lets a failed download be retried or removed", () => {
    const task: DownloadTask = {
      id: downloadIdFor(media),
      title: media.title,
      media,
      receivedBytes: 0,
      totalBytes: null,
      status: "failed",
      error: "The provider could not serve this download (HTTP 400).",
    };
    const onRemoveFailed = vi.fn();
    const onRetry = vi.fn();

    render(
      <DownloadsPage
        downloads={[]}
        tasks={[task]}
        loading={false}
        sourceCount={1}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
        onRemoveFailed={onRemoveFailed}
        onRetry={onRetry}
        onPlay={vi.fn()}
        onAddPlaylist={vi.fn()}
        onBrowseMovies={vi.fn()}
      />,
    );

    screen.getByRole("button", { name: "Retry" }).click();
    screen.getByRole("button", { name: `Remove failed download of ${media.title}` }).click();

    expect(onRetry).toHaveBeenCalledWith(task);
    expect(onRemoveFailed).toHaveBeenCalledWith(task.id);
  });
});
