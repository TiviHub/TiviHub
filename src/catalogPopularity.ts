import { normalizeCatalogTitle, normalizeImdbId, normalizeTitle, normalizeTmdbId } from "./ratings";
import type { MdblistPopularItem, Movie, Series } from "./types";

export function rankLocalCatalogByPopularity<T extends Movie | Series>(
  localItems: T[],
  popularItems: MdblistPopularItem[],
): T[] {
  const byImdb = new Map<string, T>();
  const byTmdb = new Map<string, T>();
  const byTitleYear = new Map<string, T>();
  for (const item of localItems) {
    const imdbId = normalizeImdbId(item.imdbId);
    const tmdbId = normalizeTmdbId(item.tmdbId);
    if (imdbId && !byImdb.has(imdbId)) byImdb.set(imdbId, item);
    if (tmdbId && !byTmdb.has(tmdbId)) byTmdb.set(tmdbId, item);
    if (item.year !== undefined) {
      const title = normalizeTitle(normalizeCatalogTitle(item.name, item.year));
      if (title) {
        const key = `${title}:${item.year}`;
        if (!byTitleYear.has(key)) byTitleYear.set(key, item);
      }
    }
  }

  const ranked: T[] = [];
  const seen = new Set<string>();
  for (const popular of popularItems) {
    const imdbId = normalizeImdbId(popular.imdbId);
    const tmdbId = normalizeTmdbId(popular.tmdbId);
    let match = imdbId ? byImdb.get(imdbId) : undefined;
    if (!match && tmdbId) match = byTmdb.get(tmdbId);
    if (!match && popular.year !== undefined) {
      const title = normalizeTitle(normalizeCatalogTitle(popular.title, popular.year));
      const titleMatch = title ? byTitleYear.get(`${title}:${popular.year}`) : undefined;
      if (titleMatch && !normalizeImdbId(titleMatch.imdbId) && !normalizeTmdbId(titleMatch.tmdbId)) {
        match = titleMatch;
      }
    }
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      ranked.push(match);
    }
  }
  return ranked;
}
