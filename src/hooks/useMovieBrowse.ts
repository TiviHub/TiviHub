import { useMemo } from "react";
import { createMovieBrowser } from "../browse/movies";
import type { BrowseSort } from "../browse/types";
import { isAdultContent } from "../lib/adultContent";
import type { ListCache } from "../browse/lists";
import { browseCache } from "../services/browseCache";
import { saveBrowsedMovies } from "../storage/database";
import type { Movie, Playlist } from "../types";
import { useBrowse } from "./useBrowse";
import { useStableSource } from "./useStableSource";

/** What the provider answers for a category is also stored, so favorites, library and search find these titles again. */
const withStorage = (cache: ListCache<Movie>, onFetched?: (items: Movie[]) => void): ListCache<Movie> => ({
  ...cache,
  put: async (key, items) => {
    await saveBrowsedMovies(items);
    onFetched?.(items);
    await cache.put(key, items);
  },
});

const isAdultMovie = (movie: Movie) => isAdultContent(movie.name, movie.category);

/** Movie categories and the movies of one category, loaded a batch at a time. */
export function useMovieBrowse({
  source: chosenSource,
  storedItems,
  showAdultContent,
  chosenCategoryId,
  query,
  sort,
  paused = false,
  onFetched,
}: {
  source: Playlist | undefined;
  /** Movies already stored on this device; Xtream sources ignore them and ask the provider. */
  storedItems: Movie[];
  showAdultContent: boolean;
  chosenCategoryId: string | null | undefined;
  query: string;
  sort?: BrowseSort;
  paused?: boolean;
  /** Called with the titles of a category once they are read from the provider (and stored); keep it stable. */
  onFetched?: (items: Movie[]) => void;
}) {
  const source = useStableSource(chosenSource);
  const stored = source?.type === "XTREAM" || source?.type === "STALKER" ? null : storedItems;
  const browser = useMemo(() => (source ? createMovieBrowser(source, async () => stored ?? [], withStorage(browseCache<Movie>(source.id, "movies"), onFetched)) : null), [source, stored, onFetched]);
  return useBrowse({ browser, sourceKey: source?.id, supportsAll: source?.type !== "XTREAM", isAdult: isAdultMovie, showAdultContent, chosenCategoryId, query, sort, paused });
}
