import {
  downloadOpenSubtitle,
  searchOpenSubtitles,
  type SubtitleResult,
} from "./providers/opensubtitles";
import {
  clearOpenSubtitleCache,
  countOpenSubtitleFiles,
  getOpenSubtitleChoices,
  getOpenSubtitleFileCacheEntry,
  getOpenSubtitleSearchCacheEntry,
  saveOpenSubtitleChoices,
  saveOpenSubtitleFileCacheEntry,
  saveOpenSubtitleSearchCacheEntry,
} from "./storage/database";
import type {
  OpenSubtitleChoices,
  OpenSubtitleFileCacheEntry,
  OpenSubtitleSearchCacheEntry,
} from "./types";

export const SUBTITLE_SEARCH_TTL_MILLIS = 24 * 60 * 60 * 1000;
// Subtitle files never change once published, so they are kept until the user clears the cache.
const SUBTITLE_FILE_NEVER_EXPIRES = Number.MAX_SAFE_INTEGER;

export interface SubtitleCache {
  getSearch(key: string): Promise<OpenSubtitleSearchCacheEntry | undefined>;
  putSearch(entry: OpenSubtitleSearchCacheEntry): Promise<void>;
  getFile(fileId: number): Promise<OpenSubtitleFileCacheEntry | undefined>;
  putFile(entry: OpenSubtitleFileCacheEntry): Promise<void>;
  getChoices(itemId: string): Promise<OpenSubtitleChoices | undefined>;
  putChoices(entry: OpenSubtitleChoices): Promise<void>;
}

export interface SubtitleServiceOptions {
  cache: SubtitleCache;
  search?: (apiKey: string, query: string) => Promise<SubtitleResult[]>;
  download?: (apiKey: string, fileId: number) => Promise<{ name: string; contents: string }>;
  now?: () => number;
  searchTtlMillis?: number;
}

export function createSubtitleService(options: SubtitleServiceOptions) {
  const now = options.now ?? Date.now;
  const searchTtl = options.searchTtlMillis ?? SUBTITLE_SEARCH_TTL_MILLIS;
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
    if (cached) return { name: cached.name, contents: cached.contents };

    let pending = downloads.get(fileId);
    if (!pending) {
      pending = (async () => {
        const subtitle = await downloader(apiKey, fileId);
        const fetchedAt = now();
        await options.cache.putFile({
          fileId,
          ...subtitle,
          fetchedAt,
          expiresAt: SUBTITLE_FILE_NEVER_EXPIRES,
        });
        return subtitle;
      })().finally(() => downloads.delete(fileId));
      downloads.set(fileId, pending);
    }
    return pending;
  }

  // Cache only, never the network: restoring a remembered subtitle must not spend an API download.
  async function cachedFile(fileId: number): Promise<{ name: string; contents: string } | undefined> {
    const cached = await options.cache.getFile(fileId);
    return cached ? { name: cached.name, contents: cached.contents } : undefined;
  }

  /** Every subtitle downloaded for a title, oldest first, so the newest ends up selected. */
  async function rememberChoice(itemId: string, fileId: number) {
    const fileIds = [...await choices(itemId)].filter((id) => id !== fileId);
    await options.cache.putChoices({ itemId, fileIds: [...fileIds, fileId] });
  }

  async function choices(itemId: string): Promise<number[]> {
    return (await options.cache.getChoices(itemId))?.fileIds ?? [];
  }

  /** The subtitles saved for a title, oldest first; entries whose file is gone from the cache are skipped. */
  async function saved(itemId: string): Promise<{ fileId: number; name: string }[]> {
    const found = await Promise.all((await choices(itemId)).map(async (fileId) => {
      const file = await cachedFile(fileId);
      return file ? { fileId, name: file.name } : undefined;
    }));
    return found.filter((entry) => entry !== undefined);
  }

  async function forgetChoice(itemId: string, fileId: number) {
    const fileIds = (await choices(itemId)).filter((id) => id !== fileId);
    await options.cache.putChoices({ itemId, fileIds });
  }

  return { search, download, cachedFile, rememberChoice, choices, saved, forgetChoice };
}

export const countSavedSubtitles = countOpenSubtitleFiles;

export async function clearSubtitleCache() {
  await clearOpenSubtitleCache();
}

export const subtitleService = createSubtitleService({
  cache: {
    getSearch: getOpenSubtitleSearchCacheEntry,
    putSearch: saveOpenSubtitleSearchCacheEntry,
    getFile: getOpenSubtitleFileCacheEntry,
    putFile: saveOpenSubtitleFileCacheEntry,
    getChoices: getOpenSubtitleChoices,
    putChoices: saveOpenSubtitleChoices,
  },
});
