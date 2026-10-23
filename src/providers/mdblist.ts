import {
  normalizeCatalogTitle,
  normalizeImdbId,
  normalizeTitle,
  normalizeTmdbId,
  type TitleIdentity,
} from "../lib/ratings";
import { mdblistRateLimiter, type MdblistRateLimiter } from "../lib/mdblistRateLimit";
import { MdblistError } from "../lib/mdblistError";
import type { ExternalRating, ExternalRatings } from "../types";

export { MdblistError } from "../lib/mdblistError";

export interface MdblistRequest {
  url: string;
  signal?: AbortSignal;
}

/** Injectable request boundary, so a proxy or desktop HTTP client can replace browser fetch later. */
export type MdblistTransport = (request: MdblistRequest) => Promise<Response>;

const API_BASE = "https://api.mdblist.com";
const MAX_RATINGS = 50;

const browserTransport: MdblistTransport = ({ url, signal }) =>
  fetch(url, { signal, headers: { Accept: "application/json" }, credentials: "omit" });

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function mediaPath(identity: TitleIdentity): "movie" | "show" {
  return identity.mediaType === "MOVIE" ? "movie" : "show";
}

async function getJson(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  transport: MdblistTransport,
  rateLimiter: MdblistRateLimiter,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const key = apiKey.trim();
  if (!key) throw new MdblistError("missing-key", "Add an MDBList API key in Settings to load external ratings.");
  const url = new URL(`${API_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("apikey", key);
  let response: Response;
  const release = await rateLimiter.acquire();
  if (signal?.aborted) {
    release();
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  try {
    response = await transport({ url: url.toString(), signal });
  } catch (error) {
    release();
    if (isAbort(error) || signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if (error instanceof MdblistError) throw error;
    throw new MdblistError(
      "network",
      "MDBList could not be reached from TiviHub. Check your connection and cross-origin access.",
    );
  }
  try {
    await rateLimiter.recordResponse(response);
  } finally {
    release();
  }
  if (response.status === 404) return null;
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
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error) {
    if (/not found/i.test(error)) return null;
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  return payload;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseMdblistRatings(payload: unknown): ExternalRatings {
  if (!payload || typeof payload !== "object") {
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  const body = payload as {
    ratings?: unknown;
    ids?: unknown;
    overview?: unknown;
    description?: unknown;
    plot?: unknown;
    synopsis?: unknown;
  };
  if (!Array.isArray(body.ratings)) {
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  const seen = new Set<string>();
  const ratings: ExternalRating[] = [];
  for (const raw of body.ratings.slice(0, MAX_RATINGS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { source?: unknown; value?: unknown; score?: unknown; votes?: unknown };
    if (typeof item.source !== "string") continue;
    const source = item.source.trim().toLowerCase().slice(0, 40);
    const value = finiteNumber(item.value);
    const score = finiteNumber(item.score);
    if (!source || seen.has(source) || (value === undefined && score === undefined)) continue;
    const votes = finiteNumber(item.votes);
    seen.add(source);
    ratings.push({
      source,
      ...(value !== undefined ? { value } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(votes !== undefined && votes >= 0 ? { votes: Math.floor(votes) } : {}),
    });
  }
  const ids = body.ids && typeof body.ids === "object"
    ? body.ids as { imdb?: unknown; tmdb?: unknown; imdbid?: unknown; tmdbid?: unknown }
    : {};
  const imdb = normalizeImdbId(ids.imdb ?? ids.imdbid);
  const tmdb = normalizeTmdbId(ids.tmdb ?? ids.tmdbid);
  const overview = [body.overview, body.description, body.plot, body.synopsis]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
    ?.trim()
    .slice(0, 5000);
  return {
    ratings,
    ...(overview ? { overview } : {}),
    ...(imdb || tmdb ? { ids: { ...(imdb ? { imdb } : {}), ...(tmdb ? { tmdb } : {}) } } : {}),
  };
}

interface SearchCandidate {
  imdb?: string;
  tmdb?: string;
}

function findExactMatch(payload: unknown, identity: TitleIdentity): SearchCandidate | null {
  const list = (payload as { search?: unknown }).search;
  if (!Array.isArray(list)) {
    throw new MdblistError("invalid-response", "MDBList returned an invalid response.");
  }
  const wanted = normalizeTitle(normalizeCatalogTitle(identity.title, identity.year));
  const matches = list.flatMap((raw): SearchCandidate[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { title?: unknown; year?: unknown; ids?: unknown; imdbid?: unknown; tmdbid?: unknown };
    if (typeof item.title !== "string" || normalizeTitle(normalizeCatalogTitle(item.title, identity.year)) !== wanted) return [];
    if (identity.year !== undefined && Number(item.year) !== identity.year) return [];
    const ids = item.ids && typeof item.ids === "object"
      ? item.ids as { imdb?: unknown; tmdb?: unknown; imdbid?: unknown; tmdbid?: unknown }
      : {};
    const imdb = normalizeImdbId(ids.imdb ?? ids.imdbid ?? item.imdbid);
    const tmdb = normalizeTmdbId(ids.tmdb ?? ids.tmdbid ?? item.tmdbid);
    return imdb || tmdb ? [{ imdb, tmdb }] : [];
  });
  // Ambiguous matches are treated as "not found" rather than guessed.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Looks up ratings for one title. Resolves `null` when MDBList does not know the title.
 */
export async function fetchMdblistRatings(
  identity: TitleIdentity,
  apiKey: string,
  signal?: AbortSignal,
  transport: MdblistTransport = browserTransport,
  rateLimiter: MdblistRateLimiter = mdblistRateLimiter,
): Promise<ExternalRatings | null> {
  let provider: "imdb" | "tmdb";
  let id: string;
  if (identity.imdbId) {
    provider = "imdb";
    id = identity.imdbId;
  } else if (identity.tmdbId) {
    provider = "tmdb";
    id = identity.tmdbId;
  } else {
    const params: Record<string, string> = { query: normalizeCatalogTitle(identity.title, identity.year) };
    if (identity.year !== undefined) params.year = String(identity.year);
    const found = await getJson(`/search/${mediaPath(identity)}`, params, apiKey, transport, rateLimiter, signal);
    const candidate = found ? findExactMatch(found, identity) : null;
    if (!candidate) return null;
    provider = candidate.imdb ? "imdb" : "tmdb";
    id = (candidate.imdb ?? candidate.tmdb)!;
  }
  const payload = await getJson(
    `/${provider}/${mediaPath(identity)}/${encodeURIComponent(id)}`,
    {},
    apiKey,
    transport,
    rateLimiter,
    signal,
  );
  return payload ? parseMdblistRatings(payload) : null;
}
