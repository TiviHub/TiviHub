import { isAdultContent } from "./adultContent";
import type { LiveChannel, Movie, Series } from "./types";

export type SearchSection = "Home" | "Live TV" | "TV Guide" | "Movies" | "Series" | "Library" | "Downloads" | "Settings";
export type GlobalSearchCommand =
  | { kind: "navigate"; section: SearchSection }
  | { kind: "add-source" }
  | { kind: "refresh-source" };

export type GlobalSearchMatch =
  | { type: "LIVE"; item: LiveChannel; category: string }
  | { type: "MOVIE"; item: Movie; category: string }
  | { type: "SERIES"; item: Series; category: string };

export interface GlobalSearchGroup {
  items: GlobalSearchMatch[];
  hasMore: boolean;
}

export interface GlobalSearchResults {
  channels: GlobalSearchGroup;
  movies: GlobalSearchGroup;
  series: GlobalSearchGroup;
}

const MAX_RESULTS_PER_TYPE = 8;

function collectMatches<T>(
  items: T[],
  query: string,
  showAdultContent: boolean,
  isAdult: (item: T) => boolean,
  searchText: (item: T) => string,
  createResult: (item: T) => GlobalSearchMatch,
): GlobalSearchGroup {
  const matches: GlobalSearchMatch[] = [];
  let hasMore = false;
  if (!query) return { items: matches, hasMore };

  for (const item of items) {
    if ((!showAdultContent && isAdult(item)) || !searchText(item).includes(query)) continue;
    if (matches.length === MAX_RESULTS_PER_TYPE) {
      hasMore = true;
      break;
    }
    matches.push(createResult(item));
  }
  return { items: matches, hasMore };
}

export function searchCatalog(
  value: string,
  channels: LiveChannel[],
  movies: Movie[],
  series: Series[],
  showAdultContent: boolean,
): GlobalSearchResults {
  const query = value.trim().toLowerCase();
  return {
    channels: collectMatches(
      channels,
      query,
      showAdultContent,
      (channel) => isAdultContent(channel.name, channel.group),
      (channel) => `${channel.name} ${channel.group}`.toLowerCase(),
      (item) => ({ type: "LIVE", item, category: item.group || "Uncategorized" }),
    ),
    movies: collectMatches(
      movies,
      query,
      showAdultContent,
      (movie) => isAdultContent(movie.name, movie.category),
      (movie) => `${movie.name} ${movie.category ?? ""}`.toLowerCase(),
      (item) => ({ type: "MOVIE", item, category: item.category || "Uncategorized" }),
    ),
    series: collectMatches(
      series,
      query,
      showAdultContent,
      (item) => isAdultContent(item.name, item.category),
      (item) => `${item.name} ${item.category ?? ""}`.toLowerCase(),
      (item) => ({ type: "SERIES", item, category: item.category || "Uncategorized" }),
    ),
  };
}
