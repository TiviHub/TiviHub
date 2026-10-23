import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLiveBrowser, type LiveBrowser } from "../browse/live";
import type { BrowseCategory } from "../browse/types";
import { isAdultContent } from "../lib/adultContent";
import type { LiveChannel, Playlist } from "../types";

type Loaded<T> = { browser: LiveBrowser; value: T } | { browser: LiveBrowser; error: string };

type PageState = {
  browser: LiveBrowser;
  categoryId: string | null;
  query: string;
  items: LiveChannel[];
  nextCursor?: string;
  total?: number;
  error?: string;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Could not load this list.");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Live TV categories and the channels of one category, loaded a batch at a time.
 * State is stored with the key it was loaded for, so a stale answer is never shown and no reset is needed.
 */
export function useLiveBrowse({
  source,
  storedChannels,
  showAdultContent,
  chosenCategoryId,
  query,
  paused = false,
}: {
  source: Playlist | undefined;
  /** M3U channels already stored on this device; other source types ignore it. */
  storedChannels: LiveChannel[];
  showAdultContent: boolean;
  /** undefined: nothing chosen yet, so "All" (or the first category where "All" is not offered). null is "All". */
  chosenCategoryId: string | null | undefined;
  query: string;
  /** True while the screen shows something other than a category (favorites). */
  paused?: boolean;
}) {
  const stored = source?.type === "M3U" ? storedChannels : null;
  // A new or edited source, or a refreshed M3U catalog, starts a fresh browser; other types keep their cache.
  const browser = useMemo(() => (source ? createLiveBrowser(source, async () => stored ?? []) : null), [source, stored]);
  const [categoryResult, setCategoryResult] = useState<Loaded<BrowseCategory[]> | null>(null);
  const [page, setPage] = useState<PageState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const supportsAll = source?.type !== "XTREAM";

  useEffect(() => {
    if (!browser) return;
    const controller = new AbortController();
    browser.categories(controller.signal)
      .then((value) => setCategoryResult({ browser, value }))
      .catch((error) => { if (!isAbort(error)) setCategoryResult({ browser, error: messageOf(error) }); });
    return () => controller.abort();
  }, [browser, attempt]);

  const categoriesLoaded = categoryResult && categoryResult.browser === browser ? categoryResult : null;
  const categories = useMemo(() => {
    const list = categoriesLoaded && "value" in categoriesLoaded ? categoriesLoaded.value : [];
    return showAdultContent ? list : list.filter((category) => !isAdultContent("", category.name));
  }, [categoriesLoaded, showAdultContent]);

  // Xtream answers "All" with every channel at once, so it opens on its first category instead.
  const categoryId = chosenCategoryId !== undefined ? chosenCategoryId : supportsAll ? null : categories[0]?.id;
  const enabled = !paused && categoryId !== undefined;

  useEffect(() => {
    if (!browser || !enabled || categoryId === undefined) return;
    const controller = new AbortController();
    browser.page(categoryId, undefined, query, controller.signal)
      .then((result) => setPage({ browser, categoryId, query, items: result.items, nextCursor: result.nextCursor, total: result.total }))
      .catch((error) => { if (!isAbort(error)) setPage({ browser, categoryId, query, items: [], error: messageOf(error) }); });
    return () => controller.abort();
  }, [browser, categoryId, enabled, query, attempt]);

  const current = enabled && page && page.browser === browser && page.categoryId === categoryId && page.query === query ? page : null;
  const loadingMore = useRef(false);
  const loadMore = useCallback(() => {
    if (!browser || !current || !current.nextCursor || loadingMore.current || categoryId === undefined) return;
    loadingMore.current = true;
    const same = (previous: PageState | null) =>
      previous && previous.browser === browser && previous.categoryId === categoryId && previous.query === query ? previous : null;
    browser.page(categoryId, current.nextCursor, query)
      .then((result) => setPage((previous) => same(previous)
        && { ...previous!, items: [...previous!.items, ...result.items], nextCursor: result.nextCursor, total: result.total, error: undefined }
        || previous))
      .catch((error) => setPage((previous) => same(previous) && { ...previous!, error: messageOf(error) } || previous))
      .finally(() => { loadingMore.current = false; });
  }, [browser, categoryId, current, query]);

  const items = useMemo(
    () => (showAdultContent ? current?.items : current?.items.filter((channel) => !isAdultContent(channel.name, channel.group))) ?? [],
    [current, showAdultContent],
  );

  return {
    browser,
    /** "All" is one request for every channel: free for M3U and portals, a full download on Xtream, so Xtream has none. */
    supportsAll,
    categories,
    categoryId,
    categoriesLoading: Boolean(browser) && !categoriesLoaded,
    categoriesError: categoriesLoaded && "error" in categoriesLoaded ? categoriesLoaded.error : undefined,
    items,
    total: current?.total,
    hasMore: Boolean(current?.nextCursor),
    loading: Boolean(browser) && enabled && !current,
    error: current?.error,
    loadMore,
    retry: () => setAttempt((value) => value + 1),
  };
}
