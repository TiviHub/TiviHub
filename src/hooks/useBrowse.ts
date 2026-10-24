import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { BROWSE_PAGE_SIZE, type Browser, type BrowseCategory, type BrowseSort } from "../browse/types";
import { isAdultContent } from "../lib/adultContent";

type Loaded<T> = { browser: unknown; sourceKey?: string; value: T } | { browser: unknown; sourceKey?: string; error: string };

type PageState<T> = {
  browser: Browser<T>;
  sourceKey?: string;
  categoryId: string | null;
  query: string;
  sort: BrowseSort;
  items: T[];
  nextCursor?: string;
  total?: number;
  error?: string;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Could not load this list.");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * The categories of a section and the items of one category, loaded a batch at a time (Live TV, Movies, Series).
 * State is stored with the key it was loaded for, so a stale answer is never shown and no reset is needed.
 */
export function useBrowse<T extends { name: string }>({
  browser,
  sourceKey,
  supportsAll,
  isAdult,
  showAdultContent,
  chosenCategoryId,
  query,
  sort = "default",
  paused = false,
}: {
  browser: Browser<T> | null;
  /**
   * Which source the browser reads. A new browser for the same source (its stored data was reloaded) keeps showing what
   * the old one loaded until its own answer arrives, instead of blanking the lists; another source starts clean.
   */
  sourceKey?: string;
  /** "All" is one request for every item: free for M3U and portals, a full download on Xtream, so Xtream has none. */
  supportsAll: boolean;
  isAdult: (item: T) => boolean;
  showAdultContent: boolean;
  /** undefined: nothing chosen yet, so "All" (or the first category where "All" is not offered). null is "All". */
  chosenCategoryId: string | null | undefined;
  query: string;
  sort?: BrowseSort;
  /** True while the screen shows something other than a category (favorites). */
  paused?: boolean;
}) {
  const [categoryResult, setCategoryResult] = useState<Loaded<BrowseCategory[]> | null>(null);
  const [page, setPage] = useState<PageState<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bumped when a source announces a fresher answer than the stored one it opened with.
  const [categoriesTick, setCategoriesTick] = useState(0);
  const [pageTick, setPageTick] = useState(0);

  useEffect(() => {
    if (!browser) return;
    const controller = new AbortController();
    browser.categories(controller.signal)
      .then((value) => setCategoryResult({ browser, sourceKey, value }))
      .catch((error) => { if (!isAbort(error)) setCategoryResult({ browser, sourceKey, error: messageOf(error) }); });
    return () => controller.abort();
  }, [browser, sourceKey, attempt, categoriesTick]);

  const categoriesLoaded = categoryResult && (categoryResult.browser === browser || (sourceKey !== undefined && categoryResult.sourceKey === sourceKey)) ? categoryResult : null;
  const categories = useMemo(() => {
    const list = categoriesLoaded && "value" in categoriesLoaded ? categoriesLoaded.value : [];
    return showAdultContent ? list : list.filter((category) => !isAdultContent("", category.name));
  }, [categoriesLoaded, showAdultContent]);

  // Xtream answers "All" with every item at once, so it opens on its first category instead.
  const categoryId = chosenCategoryId !== undefined ? chosenCategoryId : supportsAll ? null : categories[0]?.id;
  const enabled = !paused && categoryId !== undefined;

  useEffect(() => {
    if (!browser || !enabled || categoryId === undefined) return;
    const controller = new AbortController();
    browser.page(categoryId, undefined, query, controller.signal, sort)
      .then((result) => setPage({ browser, sourceKey, categoryId, query, sort, items: result.items, nextCursor: result.nextCursor, total: result.total }))
      .catch((error) => { if (!isAbort(error)) setPage({ browser, sourceKey, categoryId, query, sort, items: [], error: messageOf(error) }); });
    return () => controller.abort();
  }, [browser, sourceKey, categoryId, enabled, query, sort, attempt, pageTick]);

  const sameList = enabled && page && page.categoryId === categoryId && page.query === query && page.sort === sort ? page : null;
  // What an older browser of the same source loaded is shown until the new one answers; only the new one's cursors are used.
  const shown = sameList && (sameList.browser === browser || (sourceKey !== undefined && sameList.sourceKey === sourceKey)) ? sameList : null;
  const current = shown && shown.browser === browser ? shown : null;
  // The open list swaps to the fresh answer, unless you have scrolled on: more than the first batch is loaded, so it stays.
  const onRefreshed = useEffectEvent((key: string | undefined) => {
    if (key === undefined) setCategoriesTick((value) => value + 1);
    else if (key === (categoryId ?? "") && (current?.items.length ?? 0) <= BROWSE_PAGE_SIZE) setPageTick((value) => value + 1);
  });
  useEffect(() => browser?.subscribe?.((key) => onRefreshed(key)), [browser]);
  const loadingMore = useRef(false);
  const loadMore = useCallback(() => {
    if (!browser || !current || !current.nextCursor || loadingMore.current || categoryId === undefined) return;
    loadingMore.current = true;
    const same = (previous: PageState<T> | null) =>
      previous && previous.browser === browser && previous.categoryId === categoryId && previous.query === query && previous.sort === sort ? previous : null;
    browser.page(categoryId, current.nextCursor, query, undefined, sort)
      .then((result) => setPage((previous) => same(previous)
        && { ...previous!, items: [...previous!.items, ...result.items], nextCursor: result.nextCursor, total: result.total, error: undefined }
        || previous))
      .catch((error) => setPage((previous) => same(previous) && { ...previous!, error: messageOf(error) } || previous))
      .finally(() => { loadingMore.current = false; });
  }, [browser, categoryId, current, query, sort]);

  const items = useMemo(
    () => (showAdultContent ? shown?.items : shown?.items.filter((item) => !isAdult(item))) ?? [],
    [shown, isAdult, showAdultContent],
  );

  return {
    browser,
    supportsAll,
    categories,
    categoryId,
    categoriesLoading: Boolean(browser) && !categoriesLoaded,
    categoriesError: categoriesLoaded && "error" in categoriesLoaded ? categoriesLoaded.error : undefined,
    items,
    total: shown?.total,
    hasMore: Boolean(current?.nextCursor),
    loading: Boolean(browser) && enabled && !shown,
    error: shown?.error,
    loadMore,
    retry: () => setAttempt((value) => value + 1),
  };
}
