import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import {
  createSubtitleService,
  SUBTITLE_FILE_TTL_MILLIS,
  SUBTITLE_SEARCH_TTL_MILLIS,
  type SubtitleCache,
} from "../subtitleService";
import type { OpenSubtitleFileCacheEntry, OpenSubtitleSearchCacheEntry } from "../types";

function memoryCache(): SubtitleCache & {
  searches: Map<string, OpenSubtitleSearchCacheEntry>;
  files: Map<number, OpenSubtitleFileCacheEntry>;
} {
  const searches = new Map<string, OpenSubtitleSearchCacheEntry>();
  const files = new Map<number, OpenSubtitleFileCacheEntry>();
  return {
    searches,
    files,
    getSearch: async (key) => searches.get(key),
    putSearch: async (entry) => void searches.set(entry.key, entry),
    getFile: async (fileId) => files.get(fileId),
    putFile: async (entry) => void files.set(entry.fileId, entry),
  };
}

describe("OpenSubtitles cache service", () => {
  it("caches searches for 24 hours and refreshes them when expired", async () => {
    const cache = memoryCache();
    const searcher = vi.fn(async () => [{
      fileId: 81,
      fileName: "movie.srt",
      language: "en",
      downloadCount: 15,
    }]);
    let now = 1_000_000;
    const service = createSubtitleService({ cache, search: searcher, now: () => now });

    await expect(service.search("key", "The Movie")).resolves.toHaveLength(1);
    expect(cache.searches.get("search:v2:the movie")?.expiresAt).toBe(now + SUBTITLE_SEARCH_TTL_MILLIS);
    await expect(service.search("key", "  the   movie ")).resolves.toHaveLength(1);
    expect(searcher).toHaveBeenCalledOnce();

    now += SUBTITLE_SEARCH_TTL_MILLIS;
    await service.search("key", "The Movie");
    expect(searcher).toHaveBeenCalledTimes(2);
  });

  it("caches downloaded subtitle contents for 30 days", async () => {
    const cache = memoryCache();
    const download = vi.fn(async () => ({ name: "movie.srt", contents: "subtitle text" }));
    let now = 2_000_000;
    const service = createSubtitleService({ cache, download, now: () => now });

    await expect(service.download("key", 81)).resolves.toEqual({ name: "movie.srt", contents: "subtitle text" });
    expect(cache.files.get(81)?.expiresAt).toBe(now + SUBTITLE_FILE_TTL_MILLIS);
    now += SUBTITLE_FILE_TTL_MILLIS - 1;
    await expect(service.download("key", 81)).resolves.toEqual({ name: "movie.srt", contents: "subtitle text" });
    expect(download).toHaveBeenCalledOnce();

    now += 1;
    await service.download("key", 81);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous searches and downloads", async () => {
    const cache = memoryCache();
    let releaseSearch!: () => void;
    let releaseDownload!: () => void;
    const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
    const downloadGate = new Promise<void>((resolve) => { releaseDownload = resolve; });
    const searcher = vi.fn(async () => {
      await searchGate;
      return [{ fileId: 81, fileName: "movie.srt", language: "en", downloadCount: 1 }];
    });
    const downloader = vi.fn(async () => {
      await downloadGate;
      return { name: "movie.srt", contents: "subtitle text" };
    });
    const service = createSubtitleService({ cache, search: searcher, download: downloader });

    const firstSearch = service.search("key", "A title");
    const secondSearch = service.search("key", "A title");
    await vi.waitFor(() => expect(searcher).toHaveBeenCalledOnce());
    releaseSearch();
    await expect(Promise.all([firstSearch, secondSearch])).resolves.toHaveLength(2);

    const firstDownload = service.download("key", 81);
    const secondDownload = service.download("key", 81);
    await vi.waitFor(() => expect(downloader).toHaveBeenCalledOnce());
    releaseDownload();
    await expect(Promise.all([firstDownload, secondDownload])).resolves.toHaveLength(2);
  });
});
