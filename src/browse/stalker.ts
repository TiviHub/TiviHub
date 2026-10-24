import { loadStalkerTitleCategories, loadStalkerTitleCount, loadStalkerTitles } from "../providers/stalker";
import type { Movie, Playlist, Series } from "../types";
import { pagedBrowser, type ListCache } from "./lists";
import type { Browser } from "./types";

/** A portal's movies, read a batch of its pages at a time. */
export function stalkerMovieBrowser(playlist: Playlist, cache?: ListCache<Movie>): Browser<Movie> {
  return pagedBrowser({
    categories: (signal) => loadStalkerTitleCategories(playlist, "vod", signal),
    count: (categoryId) => loadStalkerTitleCount(playlist, "vod", categoryId),
    page: async (categoryId, categories, { cursor, query, sort }, signal) => {
      const result = await loadStalkerTitles(playlist, "vod", categoryId, { page: cursor ? Number(cursor) : 1, query, sortByName: sort === "az", categories }, signal);
      return { items: result.movies, nextCursor: result.nextPage ? String(result.nextPage) : undefined, total: result.total };
    },
  }, cache);
}

/** A portal's series: its series library, or the series kept in the video library when it has no series library. */
export function stalkerSeriesBrowser(playlist: Playlist, cache?: ListCache<Series>): Browser<Series> {
  let library: "series" | "vod" = "series";
  return pagedBrowser({
    categories: async (signal) => {
      const own = await loadStalkerTitleCategories(playlist, "series", signal);
      if (own.length > 0) return own;
      library = "vod";
      return loadStalkerTitleCategories(playlist, "vod", signal);
    },
    // The video library counts movies too, so only the series library's totals are true.
    count: async (categoryId) => (library === "series" ? loadStalkerTitleCount(playlist, "series", categoryId) : undefined),
    page: async (categoryId, categories, { cursor, query, sort }, signal) => {
      const result = await loadStalkerTitles(playlist, library, categoryId, { page: cursor ? Number(cursor) : 1, query, sortByName: sort === "az", categories }, signal);
      return { items: result.series, nextCursor: result.nextPage ? String(result.nextPage) : undefined, total: result.total };
    },
  }, cache);
}
