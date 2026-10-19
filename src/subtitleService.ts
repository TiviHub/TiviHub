import {
  downloadOpenSubtitle,
  searchOpenSubtitles,
  type SubtitleResult,
} from "./providers/opensubtitles";
import {
  getOpenSubtitleFileCacheEntry,
  getOpenSubtitleSearchCacheEntry,
  saveOpenSubtitleFileCacheEntry,
  saveOpenSubtitleSearchCacheEntry,
} from "./storage/database";
import type {
  OpenSubtitleFileCacheEntry,
  OpenSubtitleSearchCacheEntry,
} from "./types";

export const SUBTITLE_SEARCH_TTL_MILLIS = 24 * 60 * 60 * 1000;
export const SUBTITLE_FILE_TTL_MILLIS = 30 * 24 * 60 * 60 * 1000;

export interface SubtitleCache {
  getSearch(key: string): Promise<OpenSubtitleSearchCacheEntry | undefined>;
  putSearch(entry: OpenSubtitleSearchCacheEntry): Promise<void>;
  getFile(fileId: number): Promise<OpenSubtitleFileCacheEntry | undefined>;
  putFile(entry: OpenSubtitleFileCacheEntry): Promise<void>;
}

export interface SubtitleServiceOptions {
  cache: SubtitleCache;
  search?: (apiKey: string, query: string) => Promise<SubtitleResult[]>;
  download?: (apiKey: string, fileId: number) => Promise<{ name: string; contents: string }>;
  now?: () => number;
  searchTtlMillis?: number;
  fileTtlMillis?: number;
}

export function createSubtitleService(options: SubtitleServiceOptions) {
  const now = options.now ?? Date.now;
  const searchTtl = options.searchTtlMillis ?? SUBTITLE_SEARCH_TTL_MILLIS;
  const fileTtl = options.fileTtlMillis ?? SUBTITLE_FILE_TTL_MILLIS;
  const searcher = options.search ?? searchOpenSubtitles;
  const downloader = options.download ?? downloadOpenSubtitle;
  const searches = new Map<string, Promise<SubtitleResult[]>>();
  const downloads = new Map<number, Promise<{ name: string; contents: string }>>();

  async function search(apiKey: string, query: string): Promise<SubtitleResult[]> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const key = `search:v2:${normalizedQuery}`;
    const cached = await options.cache.getSearch(key);
    if (cached && cached.expiresAt > now()) return cached.results;

    let pending = searches.get(key);
    if (!pending) {
      pending = (async () => {
        const results = await searcher(apiKey, query);
        const fetchedAt = now();
        await options.cache.putSearch({
          key,
          results,
          fetchedAt,
          expiresAt: fetchedAt + searchTtl,
        });
        return results;
      })().finally(() => searches.delete(key));
      searches.set(key, pending);
    }
    return pending;
  }

  async function download(apiKey: string, fileId: number): Promise<{ name: string; contents: string }> {
    const cached = await options.cache.getFile(fileId);
    if (cached && cached.expiresAt > now()) {
      return { name: cached.name, contents: cached.contents };
    }

    let pending = downloads.get(fileId);
    if (!pending) {
      pending = (async () => {
        const subtitle = await downloader(apiKey, fileId);
        const fetchedAt = now();
        await options.cache.putFile({
          fileId,
          ...subtitle,
          fetchedAt,
          expiresAt: fetchedAt + fileTtl,
        });
        return subtitle;
      })().finally(() => downloads.delete(fileId));
      downloads.set(fileId, pending);
    }
    return pending;
  }

  return { search, download };
}

export const subtitleService = createSubtitleService({
  cache: {
    getSearch: getOpenSubtitleSearchCacheEntry,
    putSearch: saveOpenSubtitleSearchCacheEntry,
    getFile: getOpenSubtitleFileCacheEntry,
    putFile: saveOpenSubtitleFileCacheEntry,
  },
});
