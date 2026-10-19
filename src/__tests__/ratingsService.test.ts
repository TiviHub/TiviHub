import { describe, expect, it, vi } from "vitest";
import { MdblistError } from "../providers/mdblist";
import { createTitleIdentity } from "../ratings";
import { createRatingsService, RATINGS_TTL_MILLIS, type RatingsCache } from "../ratingsService";
import type { ExternalRatings, RatingsCacheEntry } from "../types";

const identity = createTitleIdentity({ name: "Heat", year: 1995, imdbId: "tt0113277" }, "MOVIE")!;
const ratings: ExternalRatings = { ratings: [{ source: "imdb", value: 8.3 }] };

function memoryCache(): RatingsCache & { map: Map<string, RatingsCacheEntry> } {
  const map = new Map<string, RatingsCacheEntry>();
  return { map, get: async (key) => map.get(key), put: async (entry) => void map.set(entry.key, entry) };
}

function setup(fetcher = vi.fn(async (): Promise<ExternalRatings | null> => ratings), maxConcurrency?: number) {
  const cache = memoryCache();
  let now = 1_000_000;
  const service = createRatingsService({
    cache,
    fetcher,
    getApiKey: async () => "key",
    now: () => now,
    ttlMillis: 1000,
    notFoundTtlMillis: 100,
    maxConcurrency,
  });
  return { cache, fetcher, service, advance: (ms: number) => { now += ms; } };
}

describe("ratings service", () => {
  it("fetches once, caches, then serves fresh hits with zero requests", async () => {
    const { service, fetcher } = setup();
    expect((await service.getRatings(identity)).status).toBe("fetched");
    expect(await service.getRatings(identity)).toMatchObject({ status: "fresh", ratings });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses saved ratings for 30 days before refreshing", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => ratings);
    let now = 1_000_000;
    const service = createRatingsService({
      cache,
      fetcher,
      getApiKey: async () => "key",
      now: () => now,
    });

    await service.getRatings(identity);
    expect(cache.map.get(identity.key)?.expiresAt).toBe(now + 30 * 24 * 60 * 60 * 1000);
    now += RATINGS_TTL_MILLIS - 1;
    expect((await service.getRatings(identity)).status).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 1;
    const stale = await service.getRatings(identity);
    expect(stale.status).toBe("stale");
    await stale.refresh;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serves a fresh cache without needing an API key", async () => {
    const { cache } = setup();
    const fetcher = vi.fn(async () => ratings);
    const service = createRatingsService({ cache, fetcher, getApiKey: async () => "", now: () => 1_000_001 });
    cache.map.set(identity.key, { key: identity.key, mediaType: "MOVIE", title: "Heat", ratings, fetchedAt: 1, expiresAt: 2_000_000 });
    expect((await service.getRatings(identity)).status).toBe("fresh");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refreshes expired entries, returning stale data first", async () => {
    const { service, fetcher, advance } = setup();
    await service.getRatings(identity);
    advance(2000);
    fetcher.mockResolvedValueOnce({ ratings: [{ source: "imdb", value: 9 }] });
    const stale = await service.getRatings(identity);
    expect(stale).toMatchObject({ status: "stale", ratings });
    const refreshed = await stale.refresh;
    expect(refreshed).toMatchObject({ status: "fetched", ratings: { ratings: [{ source: "imdb", value: 9 }] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps stale data when the refresh fails", async () => {
    const { service, fetcher, advance } = setup();
    await service.getRatings(identity);
    advance(2000);
    fetcher.mockRejectedValueOnce(new MdblistError("server", "down"));
    const stale = await service.getRatings(identity);
    expect(await stale.refresh).toMatchObject({ status: "stale", ratings, refreshFailed: true });
    fetcher.mockResolvedValueOnce(ratings);
    expect((await (await service.getRatings(identity)).refresh)?.status).toBe("fetched");
  });

  it("caches not-found results briefly", async () => {
    const { service, fetcher, advance } = setup(vi.fn(async () => null));
    expect((await service.getRatings(identity)).status).toBe("not-found");
    expect((await service.getRatings(identity)).status).toBe("not-found");
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(200);
    expect((await service.getRatings(identity)).status).toBe("not-found");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache temporary failures", async () => {
    const { service, fetcher, cache } = setup();
    fetcher.mockRejectedValueOnce(new MdblistError("rate-limited", "later"));
    await expect(service.getRatings(identity)).rejects.toMatchObject({ kind: "rate-limited" });
    expect(cache.map.size).toBe(0);
    expect((await service.getRatings(identity)).status).toBe("fetched");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for one identity", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { service, fetcher } = setup(vi.fn(async () => { await gate; return ratings; }));
    const results = [service.getRatings(identity), service.getRatings(identity), service.getRatings(identity)];
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    expect((await Promise.all(results)).map((result) => result.status)).toEqual(["fetched", "fetched", "fetched"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("separates movie and series keys and shares identity across playlists", async () => {
    const { service, fetcher, cache } = setup();
    const asSeries = createTitleIdentity({ name: "Heat", year: 1995, imdbId: "tt0113277" }, "SERIES")!;
    await service.getRatings(identity);
    await service.getRatings(asSeries);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect([...cache.map.keys()].sort()).toEqual(["movie:imdb:v2:tt0113277", "series:imdb:v2:tt0113277"]);
    // Same title from two playlists produces the same identity and one record.
    const fromPlaylistB = createTitleIdentity({ name: "Heat", year: 1995, imdbId: "tt0113277" }, "MOVIE")!;
    await service.getRatings(fromPlaylistB);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds concurrency across different titles", async () => {
    let running = 0;
    let peak = 0;
    const fetcher = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return ratings;
    });
    const { service } = setup(fetcher, 2);
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      service.getRatings(createTitleIdentity({ name: `T${index}`, tmdbId: String(index + 1) }, "MOVIE")!)));
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(peak).toBe(2);
  });

  it("stops waiting when cancelled without breaking other waiters", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { service, fetcher } = setup(vi.fn(async () => { await gate; return ratings; }));
    const controller = new AbortController();
    const cancelled = service.getRatings(identity, controller.signal);
    const other = service.getRatings(identity);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    release();
    expect((await other).status).toBe("fetched");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("surfaces a missing key from the provider without caching", async () => {
    const cache = memoryCache();
    const service = createRatingsService({ cache, getApiKey: async () => "", fetcher: async (_i, key) => {
      if (!key) throw new MdblistError("missing-key", "Add a key");
      return ratings;
    } });
    await expect(service.getRatings(identity)).rejects.toMatchObject({ kind: "missing-key" });
    expect(cache.map.size).toBe(0);
  });
});
