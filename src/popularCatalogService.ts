import { fetchMdblistPopularCatalog } from "./providers/mdblistCatalog";
import type { MdblistPopularCacheEntry, MdblistPopularItem, RatingsMediaType } from "./types";

export const POPULAR_CATALOG_TTL_MILLIS = 24 * 60 * 60 * 1000;

export interface PopularCatalogCache {
  get(key: string): Promise<MdblistPopularCacheEntry | undefined>;
  put(entry: MdblistPopularCacheEntry): Promise<void>;
}

export interface PopularCatalogServiceOptions {
  cache: PopularCatalogCache;
  fetcher?: (mediaType: RatingsMediaType, apiKey: string) => Promise<MdblistPopularItem[]>;
  now?: () => number;
  ttlMillis?: number;
}

export function createPopularCatalogService(options: PopularCatalogServiceOptions) {
  const now = options.now ?? Date.now;
  const ttlMillis = options.ttlMillis ?? POPULAR_CATALOG_TTL_MILLIS;
  const fetcher = options.fetcher ?? fetchMdblistPopularCatalog;
  const inFlight = new Map<string, Promise<MdblistPopularItem[]>>();

  async function getPopularCatalog(mediaType: RatingsMediaType, apiKey: string): Promise<MdblistPopularItem[]> {
    const key = `${mediaType.toLowerCase()}:tmdbpopular`;
    const cached = await options.cache.get(key).catch(() => undefined);
    if (cached?.mediaType === mediaType && cached.expiresAt > now()) return cached.items;

    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        const items = await fetcher(mediaType, apiKey);
        const fetchedAt = now();
        await options.cache.put({ key, mediaType, items, fetchedAt, expiresAt: fetchedAt + ttlMillis });
        return items;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return pending;
  }

  return { getPopularCatalog };
}

export type PopularCatalogService = ReturnType<typeof createPopularCatalogService>;
