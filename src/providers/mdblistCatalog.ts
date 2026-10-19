import { normalizeImdbId, normalizeTmdbId } from "../ratings";
import { MdblistError } from "../mdblistError";
import { mdblistRateLimiter, type MdblistRateLimiter } from "../mdblistRateLimit";
import type { MdblistPopularItem, RatingsMediaType } from "../types";

export type MdblistCatalogTransport = (url: string) => Promise<Response>;

const API_BASE = "https://api.mdblist.com";

function parseItem(raw: unknown): MdblistPopularItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as {
    title?: unknown;
    name?: unknown;
    year?: unknown;
    ids?: unknown;
    imdbid?: unknown;
    tmdbid?: unknown;
  };
  const title = typeof item.title === "string" ? item.title.trim()
    : typeof item.name === "string" ? item.name.trim() : "";
  if (!title) return null;
  const ids = item.ids && typeof item.ids === "object"
    ? item.ids as { imdb?: unknown; tmdb?: unknown; imdbid?: unknown; tmdbid?: unknown }
    : {};
  const imdbId = normalizeImdbId(ids.imdb ?? ids.imdbid ?? item.imdbid);
  const tmdbId = normalizeTmdbId(ids.tmdb ?? ids.tmdbid ?? item.tmdbid);
  const year = typeof item.year === "number" && Number.isInteger(item.year)
    ? item.year
    : typeof item.year === "string" && /^\d{4}$/.test(item.year) ? Number(item.year) : undefined;
  return {
    title,
    ...(year !== undefined ? { year } : {}),
    ...(imdbId ? { imdbId } : {}),
    ...(tmdbId ? { tmdbId } : {}),
  };
}

export function parseMdblistPopularCatalog(payload: unknown, mediaType: RatingsMediaType): MdblistPopularItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MdblistError("invalid-response", "MDBList returned an invalid catalog response.");
  }
  const body = payload as { movies?: unknown; shows?: unknown };
  const list = mediaType === "MOVIE" ? body.movies : body.shows;
  if (!Array.isArray(list)) {
    throw new MdblistError("invalid-response", "MDBList returned an invalid catalog response.");
  }
  return list.flatMap((raw) => {
    const item = parseItem(raw);
    return item ? [item] : [];
  });
}

export async function fetchMdblistPopularCatalog(
  mediaType: RatingsMediaType,
  apiKey: string,
  transport: MdblistCatalogTransport = (url) => fetch(url, { headers: { Accept: "application/json" }, credentials: "omit" }),
  rateLimiter: MdblistRateLimiter = mdblistRateLimiter,
): Promise<MdblistPopularItem[]> {
  const key = apiKey.trim();
  if (!key) throw new MdblistError("missing-key", "Add an MDBList API key in Settings to load popular titles.");
  const url = new URL(`${API_BASE}/catalog/${mediaType === "MOVIE" ? "movie" : "show"}`);
  url.searchParams.set("sort", "tmdbpopular");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "100");
  url.searchParams.set("append_to_response", "poster,ratings,description");
  url.searchParams.set("apikey", key);

  let response: Response;
  const release = await rateLimiter.acquire();
  try {
    response = await transport(url.toString());
  } catch {
    release();
    throw new MdblistError("network", "MDBList popular titles could not be reached. Check your connection.");
  }
  try {
    await rateLimiter.recordResponse(response);
  } finally {
    release();
  }
  if (response.status === 401 || response.status === 403) {
    throw new MdblistError("auth", "MDBList rejected the API key. Check it in Settings.", response.status);
  }
  if (response.status === 429) {
    throw new MdblistError("rate-limited", "MDBList rate limit reached. Try again later.", 429);
  }
  if (response.status >= 500) {
    throw new MdblistError("server", "MDBList is temporarily unavailable.", response.status);
  }
  if (!response.ok) {
    throw new MdblistError("invalid-response", `MDBList request failed with HTTP ${response.status}.`, response.status);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MdblistError("invalid-response", "MDBList returned an invalid catalog response.");
  }
  return parseMdblistPopularCatalog(payload, mediaType);
}
