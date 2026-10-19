import { fetchMdblistRatings } from "./providers/mdblist";
import type { TitleIdentity } from "./ratings";
import type { ExternalRatings, RatingsCacheEntry } from "./types";

export const RATINGS_TTL_MILLIS = 7 * 24 * 60 * 60 * 1000;
export const RATINGS_NOT_FOUND_TTL_MILLIS = 24 * 60 * 60 * 1000;
export const RATINGS_MAX_CONCURRENCY = 2;

export interface RatingsCache {
  get(key: string): Promise<RatingsCacheEntry | undefined>;
  put(entry: RatingsCacheEntry): Promise<void>;
}

export type RatingsStatus = "fresh" | "stale" | "fetched" | "not-found";

export interface RatingsResult {
  status: RatingsStatus;
  ratings?: ExternalRatings;
  fetchedAt?: number;
  /** Present only for stale results; resolves (never rejects) once the refresh settles. */
  refresh?: Promise<RatingsResult>;
  /** Set on a stale result when the refresh failed. */
  refreshFailed?: boolean;
}

export interface RatingsServiceOptions {
  cache: RatingsCache;
  getApiKey: () => Promise<string>;
  fetcher?: (identity: TitleIdentity, apiKey: string, signal?: AbortSignal) => Promise<ExternalRatings | null>;
  now?: () => number;
  ttlMillis?: number;
  notFoundTtlMillis?: number;
  maxConcurrency?: number;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function entryResult(entry: RatingsCacheEntry, status: RatingsStatus): RatingsResult {
  return { status, ratings: entry.ratings, fetchedAt: entry.fetchedAt };
}

export function createRatingsService(options: RatingsServiceOptions) {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMillis ?? RATINGS_TTL_MILLIS;
  const notFoundTtl = options.notFoundTtlMillis ?? RATINGS_NOT_FOUND_TTL_MILLIS;
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? RATINGS_MAX_CONCURRENCY);
  const fetcher = options.fetcher ?? fetchMdblistRatings;
  const inFlight = new Map<string, Promise<RatingsResult>>();
  const waiting: Array<() => void> = [];
  let active = 0;

  async function acquire(signal?: AbortSignal): Promise<void> {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        const index = waiting.indexOf(grant);
        if (index >= 0) waiting.splice(index, 1);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(grant);
    });
  }

  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  async function load(identity: TitleIdentity): Promise<RatingsResult> {
    // The shared request is not tied to one caller's signal so one cancelled
    // view cannot fail other waiters; callers stop waiting via `withSignal`.
    await acquire();
    try {
      const apiKey = await options.getApiKey();
      const ratings = await fetcher(identity, apiKey);
      const fetchedAt = now();
      const entry: RatingsCacheEntry = {
        key: identity.key,
        mediaType: identity.mediaType,
        title: identity.title,
        year: identity.year,
        externalIds: {
          ...(identity.imdbId ? { imdb: identity.imdbId } : {}),
          ...(identity.tmdbId ? { tmdb: identity.tmdbId } : {}),
          ...ratings?.ids,
        },
        ratings: ratings ?? undefined,
        notFound: ratings === null ? true : undefined,
        fetchedAt,
        expiresAt: fetchedAt + (ratings === null ? notFoundTtl : ttl),
      };
      await options.cache.put(entry).catch(() => undefined);
      return entryResult(entry, ratings === null ? "not-found" : "fetched");
    } finally {
      release();
    }
  }

  function shared(identity: TitleIdentity): Promise<RatingsResult> {
    let promise = inFlight.get(identity.key);
    if (!promise) {
      promise = load(identity).finally(() => inFlight.delete(identity.key));
      inFlight.set(identity.key, promise);
    }
    return promise;
  }

  function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
      promise.catch(() => undefined);
      return Promise.reject(abortError());
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  /**
   * Cache-first lookup. Fresh entries make no request; stale entries are returned immediately
   * with a `refresh` promise; missing entries await one shared request. Failures are not cached.
   */
  async function getRatings(identity: TitleIdentity, signal?: AbortSignal): Promise<RatingsResult> {
    if (signal?.aborted) throw abortError();
    let cached: RatingsCacheEntry | undefined;
    try {
      cached = await options.cache.get(identity.key);
    } catch {
      cached = undefined;
    }
    if (signal?.aborted) throw abortError();
    if (cached && cached.mediaType === identity.mediaType) {
      if (cached.expiresAt > now()) return entryResult(cached, cached.notFound ? "not-found" : "fresh");
      if (!cached.notFound && cached.ratings) {
        const stale = entryResult(cached, "stale");
        stale.refresh = shared(identity).catch((): RatingsResult => ({
          ...entryResult(cached, "stale"),
          refreshFailed: true,
        }));
        return stale;
      }
    }
    return withSignal(shared(identity), signal);
  }

  return { getRatings };
}

export type RatingsService = ReturnType<typeof createRatingsService>;
