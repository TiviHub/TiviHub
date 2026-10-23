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

export function normalizeCatalogTitle(title: string, year?: number): string {
  let cleaned = title.replace(/^\s*[a-z]{2,3}\s*-\s*/i, "").trim();
  const videoQualitySuffix = /(?:\s+|\s*[[(])(?:4k|2160p|1080p|720p|480p|uhd|fhd|hd|hdr10?|dolby\s+vision|dv|hevc|x26[45])(?:\s*[\])])?\s*$/i;
  while (videoQualitySuffix.test(cleaned)) {
    cleaned = cleaned.replace(videoQualitySuffix, "").trim();
  }
  if (year !== undefined) {
    cleaned = cleaned
      .replace(new RegExp(`\\s*(?:\\(${year}\\)|\\[${year}\\]|${year})\\s*$`), "")
      .trim();
  }
  return cleaned;
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
  if (imdbId) return { ...base, key: `${type}:imdb:v2:${imdbId}` };
  if (tmdbId) return { ...base, key: `${type}:tmdb:v2:${tmdbId}` };
  const normalized = normalizeTitle(normalizeCatalogTitle(title, item.year));
  // Without an external ID, require a year so we never guess among remakes.
  if (!normalized || item.year === undefined || !Number.isInteger(item.year)) return null;
  return { ...base, key: `${type}:title:v3:${normalized}:${item.year}` };
}
