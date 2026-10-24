import type { ListCache } from "../browse/lists";
import type { BrowseCategory } from "../browse/types";
import { getLiveCategoryCache, saveLiveCategoryCache } from "../storage/database";

export type BrowseSection = "live" | "movies" | "series";

/**
 * The between-sessions copy of what a source answered for Live TV, Movies and Series, in the `liveCategoryCache` store:
 * one row for the category list and one row per category (the provider's whole answer for it).
 * Live keys are `<playlistId>:<categoryId>`; the others `<playlistId>:<section>:<categoryId>`. Rows go away with their playlist.
 */
export function browseCache<T>(playlistId: string, section: BrowseSection): ListCache<T> {
  const keyOf = (key: string) => (section === "live" ? `${playlistId}:${key}` : `${playlistId}:${section}:${key}`);
  const field = section === "live" ? "channels" : section;
  return {
    get: async (key) => {
      const entry = await getLiveCategoryCache(keyOf(key));
      const items = entry?.[field] as T[] | undefined;
      return entry && items ? { items, savedAt: entry.savedAt } : undefined;
    },
    put: (key, items) => saveLiveCategoryCache({
      key: keyOf(key),
      playlistId,
      channels: [],
      ...{ [field]: items },
      savedAt: Date.now(),
    }),
    getCategories: async () => {
      const entry = await getLiveCategoryCache(keyOf("@@categories"));
      return entry?.categories ? { items: entry.categories, savedAt: entry.savedAt } : undefined;
    },
    putCategories: (categories: BrowseCategory[]) =>
      saveLiveCategoryCache({ key: keyOf("@@categories"), playlistId, channels: [], categories, savedAt: Date.now() }),
  };
}
