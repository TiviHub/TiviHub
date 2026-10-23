import { describe, expect, it, vi } from "vitest";
import { createPopularCatalogService, POPULAR_CATALOG_TTL_MILLIS, type PopularCatalogCache } from "../services/popularCatalogService";
import type { MdblistPopularCacheEntry, MdblistPopularItem } from "../types";

function memoryCache(): PopularCatalogCache & { map: Map<string, MdblistPopularCacheEntry> } {
  const map = new Map<string, MdblistPopularCacheEntry>();
  return { map, get: async (key) => map.get(key), put: async (entry) => void map.set(entry.key, entry) };
}

const popular: MdblistPopularItem[] = [{ title: "Example Movie", year: 2024, tmdbId: "42" }];

describe("popular catalog service", () => {
  it("caches catalog results for 24 hours and makes no redundant request", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => popular);
    let now = 1_000_000;
    const service = createPopularCatalogService({ cache, fetcher, now: () => now });

    await expect(service.getPopularCatalog("MOVIE", "key")).resolves.toEqual(popular);
    expect(cache.map.get("movie:tmdbpopular")?.expiresAt).toBe(now + POPULAR_CATALOG_TTL_MILLIS);
    now += POPULAR_CATALOG_TTL_MILLIS - 1;
    await expect(service.getPopularCatalog("MOVIE", "key")).resolves.toEqual(popular);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("deduplicates simultaneous catalog requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async () => { await gate; return popular; });
    const service = createPopularCatalogService({ cache: memoryCache(), fetcher });
    const first = service.getPopularCatalog("SERIES", "key");
    const second = service.getPopularCatalog("SERIES", "key");
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([popular, popular]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
