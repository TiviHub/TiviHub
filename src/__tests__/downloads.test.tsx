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
  removeDownload,
  removeOrphanedParts,
  type DownloadableMedia,
  type DownloadTask,
} from "../services/downloads";
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

async function storedFileKeys(): Promise<IDBValidKey[]> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tivihub-downloads");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = database.transaction("files").objectStore("files").getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return keys;
}

function streamOf(megabytes: number, failAfter?: number) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && sent >= failAfter) {
        controller.error(new Error("connection lost"));
        return;
      }
      if (sent >= megabytes) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(new Uint8Array(1024 ** 2));
    },
  });
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
  it("downloads through the backend proxy when the source has a User-Agent", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "proxy_register") return { baseUrl: "http://127.0.0.1:5000/p/token" };
      return undefined;
    });
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke });
    const fetchMock = vi.fn(async (_address: string) => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await downloadMedia(media, new AbortController().signal, vi.fn(), "Custom/1");

    expect(fetchMock.mock.calls[0][0])
      .toBe("http://127.0.0.1:5000/p/token?u=https%3A%2F%2Fmedia.example%2Fsample.mp4");
    expect(invoke).toHaveBeenCalledWith("proxy_register", { headers: [["User-Agent", "Custom/1"]] }, undefined);
  });

  it("stores a large video in pieces and joins them for playback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(20), {
      headers: { "content-type": "video/mp4", "content-length": String(20 * 1024 ** 2) },
    })));

    const { record } = await downloadMedia(media, new AbortController().signal, vi.fn());

    expect(record.parts).toBe(3);
    expect(record.sizeBytes).toBe(20 * 1024 ** 2);
    // fake-indexeddb cannot keep a Blob's bytes, so only the join itself is checked here.
    expect(await getDownloadedBlob(record.id)).toBeInstanceOf(Blob);
  });

  it("leaves no stored pieces behind when the connection drops", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(20, 10), {
      headers: { "content-type": "video/mp4" },
    })));

    await expect(downloadMedia(media, new AbortController().signal, vi.fn())).rejects.toThrow("connection lost");

    expect(await storedFileKeys()).toEqual([]);
  });

  it("removes pieces whose download never finished", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(20), {
      headers: { "content-type": "video/mp4" },
    })));
    const { record } = await downloadMedia(media, new AbortController().signal, vi.fn());
    expect(await storedFileKeys()).toHaveLength(3);

    await removeOrphanedParts();
    expect(await storedFileKeys()).toHaveLength(3);
    await removeDownload(record.id);
    expect(await storedFileKeys()).toEqual([]);
  });

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
      headers: { "content-type": "video/mp4", "content-length": String(9 * 1024 ** 3) },
    })));

    await expect(downloadMedia(media, new AbortController().signal, vi.fn()))
      .rejects.toThrow("larger than 8 GB");
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
