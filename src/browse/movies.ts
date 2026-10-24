import { loadXtreamMovieCategories, loadXtreamMovies } from "../providers/xtream";
import type { Movie, Playlist } from "../types";
import { cachedBrowser, memoryBrowser, type ListCache } from "./lists";
import { stalkerMovieBrowser } from "./stalker";
import type { Browser } from "./types";

/** Movies read per category, one batch at a time. */
export type MovieBrowser = Browser<Movie>;

/** Where the last answer for an Xtream category is kept between sessions. */
export type MovieCache = ListCache<Movie>;

function xtreamBrowser(playlist: Playlist, cache?: MovieCache): MovieBrowser {
  return cachedBrowser({
    categories: (signal) => loadXtreamMovieCategories(playlist, signal),
    list: (key, categories, signal) => loadXtreamMovies(playlist, key, categories, signal),
    all: { categoryOf: (movie) => movie.categoryId },
  }, cache);
}

/** Other sources keep their movies on this device already: group them by category here. */
export function createMovieBrowser(playlist: Playlist, storedMovies: () => Promise<Movie[]>, cache?: MovieCache): MovieBrowser {
  if (playlist.type === "XTREAM") return xtreamBrowser(playlist, cache);
  if (playlist.type === "STALKER") return stalkerMovieBrowser(playlist, cache);
  const browser = memoryBrowser(storedMovies, { groupOf: (movie) => movie.category || "Uncategorized" });
  return { categories: browser.categories, page: browser.page };
}
