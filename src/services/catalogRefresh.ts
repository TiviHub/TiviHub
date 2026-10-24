import type {
  CatalogChangeCount,
  CatalogChangeSummary,
  Episode,
  LiveChannel,
  Movie,
  Series,
} from "../types";

export type { CatalogChangeSummary } from "../types";

export interface CatalogSnapshot {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
}

export interface CatalogCandidate {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes?: Episode[];
}

function changes<T extends { id: string }>(previous: T[], next: T[]): CatalogChangeCount {
  const previousIds = new Set(previous.map((item) => item.id));
  const nextIds = new Set(next.map((item) => item.id));
  return {
    added: next.filter((item) => !previousIds.has(item.id)).length,
    removed: previous.filter((item) => !nextIds.has(item.id)).length,
  };
}

export function summarizeCatalogChanges(
  previous: CatalogSnapshot,
  next: CatalogCandidate,
): CatalogChangeSummary {
  return {
    channels: changes(previous.channels, next.channels),
    movies: changes(previous.movies, next.movies),
    series: changes(previous.series, next.series),
    ...(next.episodes === undefined ? {} : { episodes: changes(previous.episodes, next.episodes) }),
  };
}

export function formatCatalogChangeSummary(summary: CatalogChangeSummary): string {
  const counts = [summary.channels, summary.movies, summary.series, summary.episodes]
    .filter((count): count is CatalogChangeCount => count !== undefined);
  const added = counts.reduce((total, count) => total + count.added, 0);
  const removed = counts.reduce((total, count) => total + count.removed, 0);
  if (added === 0 && removed === 0) return "No catalog changes.";
  return `${added.toLocaleString()} added, ${removed.toLocaleString()} removed.`;
}

/** Xtream imports only live channels: the movies and series read while browsing stay as they are. Changes `next` in place. */
export function keepBrowsedTitles(next: CatalogCandidate, previous: CatalogSnapshot): void {
  next.movies = previous.movies;
  next.series = previous.series;
}

export function validateCatalogForSource(sourceId: string, catalog: CatalogCandidate): void {
  const collections: Array<[string, Array<{ id: string; playlistId: string }>]> = [
    ["channels", catalog.channels],
    ["movies", catalog.movies],
    ["series", catalog.series],
    ...(catalog.episodes === undefined ? [] : [["episodes", catalog.episodes] as [
      string,
      Array<{ id: string; playlistId: string }>,
    ]]),
  ];

  for (const [name, records] of collections) {
    const ids = new Set<string>();
    for (const record of records) {
      if (!record.id || record.playlistId !== sourceId) {
        throw new Error(`The refreshed ${name} list did not match this source. Your saved catalog was kept.`);
      }
      if (ids.has(record.id)) {
        throw new Error(`The refreshed ${name} list contained duplicate items. Your saved catalog was kept.`);
      }
      ids.add(record.id);
    }
  }
}

export function isSuspiciousCatalogDrop(
  previous: CatalogSnapshot,
  next: CatalogCandidate,
): boolean {
  const previousTotal = previous.channels.length + previous.movies.length + previous.series.length +
    (next.episodes === undefined ? 0 : previous.episodes.length);
  const nextTotal = next.channels.length + next.movies.length + next.series.length +
    (next.episodes?.length ?? 0);
  if (previousTotal === 0) return false;
  if (nextTotal === 0) return true;

  const comparableCollections = [
    [previous.channels, next.channels],
    [previous.movies, next.movies],
    [previous.series, next.series],
    ...(next.episodes === undefined ? [] : [[previous.episodes, next.episodes]]),
  ];
  const largeCategoryDrop = comparableCollections.some(([oldRecords, newRecords]) => {
    const oldCount = oldRecords.length;
    const newCount = newRecords.length;
    const removed = oldCount - newCount;
    return (oldCount >= 10 && newCount === 0) ||
      (removed >= 20 && removed / oldCount >= 0.5);
  });
  return largeCategoryDrop || (previousTotal >= 100 && nextTotal <= previousTotal * 0.25);
}
