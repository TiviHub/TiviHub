import { useMemo } from "react";
import { t, useLocale } from "../lib/i18n";
import type { BrowseCategory } from "../browse/types";
import type { BrowseCategoryEntry } from "../components/BrowseCategoryList";

export const FAVORITES_ID = "@@favorites";

/** Totals seen per browser; a browser is replaced when the source or its settings change, which drops them. */
const learnedByBrowser = new WeakMap<object, Map<string, number>>();

/**
 * The tiles of a category list (Live TV, Movies, Series), with one rule for counts: a count is shown only when it is true.
 * That is a count the source sent with its categories, a count from a list that is known to be complete (the live channels
 * stored on this device: every source imports all of them), or the total of a category once it has been opened this session.
 * Never a guess: stored movies and series can be a part of a category, and "0" would be a lie.
 */
export function useCategoryEntries(
  browse: { browser: unknown; supportsAll: boolean; categories: BrowseCategory[]; categoryId: string | null | undefined; total: number | undefined },
  query: string,
  favoritesCount: number,
  showingFavorites: boolean,
  /** Complete counts by category name, when the whole list is on this device. */
  knownByName?: ReadonlyMap<string, number>,
): BrowseCategoryEntry[] {
  const locale = useLocale();
  const { browser, supportsAll, categories, categoryId, total } = browse;
  // Written while rendering on purpose: the same answer gives the same entry, and it must show in this render.
  let learned: Map<string, number> | undefined;
  if (browser && typeof browser === "object") {
    learned = learnedByBrowser.get(browser);
    if (!learned) learnedByBrowser.set(browser, learned = new Map());
    if (!showingFavorites && !query.trim() && categoryId !== undefined && total !== undefined) learned.set(categoryId ?? "", total);
  }
  return useMemo(() => [
    { id: FAVORITES_ID, name: t("browse.favorites"), count: favoritesCount, pinned: true },
    ...(supportsAll ? [{ id: "", name: t("browse.all"), count: learned?.get(""), pinned: true }] : []),
    ...categories.map((category) => ({ ...category, count: category.count ?? knownByName?.get(category.name) ?? learned?.get(category.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `learned` changes only together with categoryId and total
  ], [categories, supportsAll, favoritesCount, categoryId, total, learned, knownByName, locale]);
}
