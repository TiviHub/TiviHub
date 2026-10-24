import { loadXtreamSeries, loadXtreamSeriesCategories } from "../providers/xtream";
import type { Playlist, Series } from "../types";
import { cachedBrowser, memoryBrowser, type ListCache } from "./lists";
import { stalkerSeriesBrowser } from "./stalker";
import type { Browser } from "./types";

/** Series read per category, one batch at a time. */
export type SeriesBrowser = Browser<Series>;

/** Where the last answer for an Xtream category is kept between sessions. */
export type SeriesCache = ListCache<Series>;

/** Other sources keep their series on this device already: group them by category here. */
export function createSeriesBrowser(playlist: Playlist, storedSeries: () => Promise<Series[]>, cache?: SeriesCache): SeriesBrowser {
  if (playlist.type === "STALKER") return stalkerSeriesBrowser(playlist, cache);
  if (playlist.type === "XTREAM") {
    return cachedBrowser({
      categories: (signal) => loadXtreamSeriesCategories(playlist, signal),
      list: (key, categories, signal) => loadXtreamSeries(playlist, key, categories, signal),
      all: { categoryOf: (show) => show.categoryId },
    }, cache);
  }
  const browser = memoryBrowser(storedSeries, { groupOf: (series) => series.category || "Uncategorized" });
  return { categories: browser.categories, page: browser.page };
}
