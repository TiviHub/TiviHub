import type { Movie, RatingsMediaType, Series } from "./types";

export interface TitleIdentity {
  /** Stable cache key; never derived from playlist or catalog IDs. */
  key: string;
  mediaType: RatingsMediaType;
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
}

const IMDB_ID = /^tt\d{5,10}$/i;
const TMDB_ID = /^\d{1,10}$/;

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeImdbId(value: unknown): string | undefined {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return IMDB_ID.test(text) ? text.toLowerCase() : undefined;
}

export function normalizeTmdbId(value: unknown): string | undefined {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return TMDB_ID.test(text) && Number(text) > 0 ? String(Number(text)) : undefined;
}

export function createTitleIdentity(
  item: Pick<Movie | Series, "name" | "year" | "imdbId" | "tmdbId">,
  mediaType: RatingsMediaType,
): TitleIdentity | null {
  const type = mediaType.toLowerCase();
  const imdbId = normalizeImdbId(item.imdbId);
  const tmdbId = normalizeTmdbId(item.tmdbId);
  const title = item.name.trim();
  const base = { mediaType, title, year: item.year, imdbId, tmdbId };
  if (imdbId) return { ...base, key: `${type}:imdb:${imdbId}` };
  if (tmdbId) return { ...base, key: `${type}:tmdb:${tmdbId}` };
  const normalized = normalizeTitle(title);
  // Without an external ID, require a year so we never guess among remakes.
  if (!normalized || item.year === undefined || !Number.isInteger(item.year)) return null;
  return { ...base, key: `${type}:title:${normalized}:${item.year}` };
}
