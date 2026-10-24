import { useMemo } from "react";
import { createSeriesBrowser } from "../browse/series";
import type { BrowseSort } from "../browse/types";
import { isAdultContent } from "../lib/adultContent";
import type { ListCache } from "../browse/lists";
import { browseCache } from "../services/browseCache";
import { saveBrowsedSeries } from "../storage/database";
import type { Series, Playlist } from "../types";
import { useBrowse } from "./useBrowse";
import { useStableSource } from "./useStableSource";

/** What the provider answers for a category is also stored, so favorites, library and search find these titles again. */
const withStorage = (cache: ListCache<Series>, onFetched?: (items: Series[]) => void): ListCache<Series> => ({
  ...cache,
  put: async (key, items) => {
    await saveBrowsedSeries(items);
    onFetched?.(items);
    await cache.put(key, items);
  },
});

const isAdultSeries = (show: Series) => isAdultContent(show.name, show.category);

/** Series categories and the series of one category, loaded a batch at a time. */
export function useSeriesBrowse({
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
  /** Series already stored on this device; Xtream sources ignore them and ask the provider. */
  storedItems: Series[];
  showAdultContent: boolean;
  chosenCategoryId: string | null | undefined;
  query: string;
  sort?: BrowseSort;
  paused?: boolean;
  /** Called with the titles of a category once they are read from the provider (and stored); keep it stable. */
  onFetched?: (items: Series[]) => void;
}) {
  const source = useStableSource(chosenSource);
  const stored = source?.type === "XTREAM" || source?.type === "STALKER" ? null : storedItems;
  const browser = useMemo(() => (source ? createSeriesBrowser(source, async () => stored ?? [], withStorage(browseCache<Series>(source.id, "series"), onFetched)) : null), [source, stored, onFetched]);
  return useBrowse({ browser, sourceKey: source?.id, supportsAll: source?.type !== "XTREAM", isAdult: isAdultSeries, showAdultContent, chosenCategoryId, query, sort, paused });
}
