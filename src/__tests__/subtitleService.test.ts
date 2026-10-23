import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import {
  createSubtitleService,
  SUBTITLE_SEARCH_TTL_MILLIS,
  type SubtitleCache,
} from "../subtitleService";
import type { OpenSubtitleChoices, OpenSubtitleFileCacheEntry, OpenSubtitleSearchCacheEntry } from "../types";

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
    getChoices: async () => undefined,
    putChoices: async () => undefined,
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

  it("cachedFile returns a cached subtitle without downloading", async () => {
    const cache = memoryCache();
    const downloader = vi.fn(async () => ({ name: "a.srt", contents: "x" }));
    const service = createSubtitleService({ cache, download: downloader });

    await expect(service.cachedFile(7)).resolves.toBeUndefined();
    await service.download("key", 7);
    await expect(service.cachedFile(7)).resolves.toEqual({ name: "a.srt", contents: "x" });
    expect(downloader).toHaveBeenCalledOnce();
  });

  it("keeps downloaded subtitle contents forever", async () => {
    const cache = memoryCache();
    const download = vi.fn(async () => ({ name: "movie.srt", contents: "subtitle text" }));
    let now = 2_000_000;
    const service = createSubtitleService({ cache, download, now: () => now });

    await service.download("key", 81);
    now += 10 * 365 * 24 * 60 * 60 * 1000;
    await expect(service.download("key", 81)).resolves.toEqual({ name: "movie.srt", contents: "subtitle text" });
    expect(download).toHaveBeenCalledOnce();
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

describe("remembered subtitle choices", () => {
  it("keeps every downloaded subtitle per title, newest last, without duplicates", async () => {
    const choices = new Map<string, OpenSubtitleChoices>();
    const service = createSubtitleService({
      cache: { ...memoryCache(), getChoices: async (id) => choices.get(id), putChoices: async (e) => void choices.set(e.itemId, e) },
    });
    await service.rememberChoice("movie-1", 1);
    await service.rememberChoice("movie-1", 2);
    await service.rememberChoice("movie-1", 1);
    expect(await service.choices("movie-1")).toEqual([2, 1]);
    expect(await service.choices("movie-2")).toEqual([]);
  });

  it("lists saved subtitles by name and forgets one without touching the others", async () => {
    const choices = new Map<string, OpenSubtitleChoices>();
    const cache = { ...memoryCache(), getChoices: async (id: string) => choices.get(id), putChoices: async (e: OpenSubtitleChoices) => void choices.set(e.itemId, e) };
    const service = createSubtitleService({ cache, download: async (_key, id) => ({ name: `sub-${id}.srt`, contents: "x" }) });
    for (const id of [1, 2]) {
      await service.download("key", id);
      await service.rememberChoice("movie-1", id);
    }
    expect(await service.saved("movie-1")).toEqual([{ fileId: 1, name: "sub-1.srt" }, { fileId: 2, name: "sub-2.srt" }]);
    await service.forgetChoice("movie-1", 1);
    expect(await service.saved("movie-1")).toEqual([{ fileId: 2, name: "sub-2.srt" }]);
  });
});
