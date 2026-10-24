import { useEffect, useMemo, useRef, useState } from "react";
import { sortByName } from "../browse/lists";
import type { BrowseSort } from "../browse/types";
import type { useBrowse } from "../hooks/useBrowse";
import { FAVORITES_ID, useCategoryEntries } from "../hooks/useCategoryEntries";
import { formatNumber, t } from "../lib/i18n";
import { sectionLabel } from "../lib/sectionLabel";
import type { MessageKey } from "../locales";
import type { Favorite, LibraryItem, Movie, Playlist, Series } from "../types";
import { BrowseCategoryList } from "./BrowseCategoryList";
import { BrowseSortButton } from "./BrowseSortButton";
import { CatalogCard } from "./ContentPages";
import { SearchField } from "./common";
import { EmptyPanel } from "./EmptyPanel";
import { GridCardSkeletons } from "./Skeleton";

const SECTION_KEYS = {
  Movies: {
    categories: "catalog.movies.categories", search: "catalog.movies.search", sort: "catalog.movies.sort",
    loading: "catalog.movies.loading", noFavoritesTitle: "catalog.movies.noFavoritesTitle",
    noMatchesBody: "catalog.movies.noMatchesBody", noItemsTitle: "catalog.movies.noItemsTitle",
    noItemsBody: "catalog.movies.noItemsBody", loadFailed: "catalog.movies.loadFailed",
  },
  Series: {
    categories: "catalog.series.categories", search: "catalog.series.search", sort: "catalog.series.sort",
    loading: "catalog.series.loading", noFavoritesTitle: "catalog.series.noFavoritesTitle",
    noMatchesBody: "catalog.series.noMatchesBody", noItemsTitle: "catalog.series.noItemsTitle",
    noItemsBody: "catalog.series.noItemsBody", loadFailed: "catalog.series.loadFailed",
  },
} as const satisfies Record<"Movies" | "Series", Record<string, MessageKey>>;

/**
 * Movies and Series: categories on the left, the titles of the chosen one next to it, loaded a batch at a time as
 * you scroll. The section's browse hook is passed in because it needs the search and sort chosen here.
 */
export function CatalogBrowsePage<T extends Movie | Series>({
  section,
  source,
  storedItems,
  showAdultContent,
  favorites,
  library,
  useItems,
  onOpen,
  onToggleFavorite,
  onAddToLibrary,
  onFetched,
}: {
  section: "Movies" | "Series";
  source: Playlist | undefined;
  /** Titles already stored on this device: they give Favorites and the category counts. */
  storedItems: T[];
  showAdultContent: boolean;
  favorites: Favorite[];
  library: LibraryItem[];
  /** The section's browse hook (useMovieBrowse, useSeriesBrowse). */
  useItems: (args: {
    source: Playlist | undefined;
    storedItems: T[];
    showAdultContent: boolean;
    chosenCategoryId: string | null | undefined;
    query: string;
    sort: BrowseSort;
    paused: boolean;
    onFetched?: (items: T[]) => void;
  }) => ReturnType<typeof useBrowse<T>>;
  onOpen: (item: T) => void;
  onToggleFavorite: (item: T) => void;
  onAddToLibrary: (item: T) => void;
  /** Titles just read from the provider; the app keeps them in memory next to the stored ones. */
  onFetched?: (items: T[]) => void;
}) {
  const contentType = section === "Movies" ? "MOVIE" : "SERIES";
  const k = SECTION_KEYS[section];
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("default");
  const showingFavorites = chosen === FAVORITES_ID;
  const browse = useItems({ source, storedItems, showAdultContent, chosenCategoryId: showingFavorites ? undefined : chosen, query, sort, paused: showingFavorites, onFetched });

  const favoriteIds = useMemo(
    () => new Set(favorites.filter((favorite) => favorite.contentType === contentType).map((favorite) => favorite.contentId)),
    [contentType, favorites],
  );
  const libraryIds = useMemo(
    () => new Set(library.filter((entry) => entry.contentType === contentType).map((entry) => entry.contentId)),
    [contentType, library],
  );
  const favoriteItems = useMemo(
    () => storedItems.filter((item) => item.playlistId === source?.id && favoriteIds.has(item.id)),
    [favoriteIds, source?.id, storedItems],
  );
  const shownItems = useMemo(() => {
    if (!showingFavorites) return browse.items;
    const needle = query.trim().toLowerCase();
    const matching = favoriteItems.filter((item) => !needle || item.name.toLowerCase().includes(needle));
    return sort === "default" ? matching : sortByName(matching, sort);
  }, [browse.items, favoriteItems, query, showingFavorites, sort]);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canObserve = typeof IntersectionObserver !== "undefined";
  const { hasMore, loadMore } = browse;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || !canObserve || showingFavorites) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root: listRef.current, rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canObserve, hasMore, loadMore, showingFavorites, shownItems.length]);

  const categoryEntries = useCategoryEntries(browse, query, favoriteItems.length, showingFavorites);
  const effectiveId = showingFavorites ? FAVORITES_ID : browse.categoryId;
  const categoryName = showingFavorites
    ? t("browse.favorites")
    : effectiveId === null || effectiveId === undefined
      ? t("browse.all")
      : browse.categories.find((category) => category.id === effectiveId)?.name ?? "";

  return (
    <section className="catalog-page">
      <h1 className="sr-only">{sectionLabel(section)}</h1>
      <div className="live-tv-layout browse-layout movies-layout">
        <BrowseCategoryList
          categories={categoryEntries}
          error={browse.categoriesError}
          loading={browse.categoriesLoading}
          onRetry={browse.retry}
          onSelect={setChosen}
          selectedId={effectiveId}
          title={t(k.categories)}
        />
        <aside aria-label={sectionLabel(section)} className="live-channel-sidebar">
          <div className="live-channel-sidebar-heading">
            <h2>{categoryName || sectionLabel(section)}</h2>
            <span>{formatNumber(showingFavorites ? favoriteItems.length : browse.total ?? shownItems.length)}</span>
          </div>
          <div className="browse-panel-tools">
            <SearchField label={t(k.search)} onChange={setQuery} placeholder={t(k.search)} value={query} />
            <BrowseSortButton label={t(k.sort)} onChange={setSort} value={sort} />
          </div>
          <div className={`live-channel-list browse-list movies-grid${browse.loading ? " is-loading" : ""}`} ref={listRef}>
            {browse.loading && (
              <>
                <span aria-live="polite" className="sr-only" role="status">{t(k.loading)}</span>
                <GridCardSkeletons count={36} />
              </>
            )}
            {showingFavorites && shownItems.length === 0 && (
              <EmptyPanel className="movies-grid-message" icon="favorite_border" title={t(k.noFavoritesTitle)}>{t("catalog.noFavoritesBody")}</EmptyPanel>
            )}
            {!browse.loading && !showingFavorites && !browse.error && shownItems.length === 0 && (
              query.trim()
                ? <EmptyPanel className="movies-grid-message" icon="search" title={t("categories.noMatchesTitle")}>{t(k.noMatchesBody)}</EmptyPanel>
                : <EmptyPanel className="movies-grid-message" icon={section === "Movies" ? "movie" : "tv"} title={t(k.noItemsTitle)}>{t(k.noItemsBody)}</EmptyPanel>
            )}
            {shownItems.map((item) => (
              <CatalogCard
                inLibrary={libraryIds.has(item.id)}
                isFavorite={favoriteIds.has(item.id)}
                item={item}
                key={item.id}
                onAddToLibrary={() => onAddToLibrary(item)}
                onFavorite={() => onToggleFavorite(item)}
                onOpen={() => onOpen(item)}
                section={section}
              />
            ))}
            {browse.error && (
              <EmptyPanel action={<button className="secondary-button" onClick={browse.retry} type="button">{t("common.tryAgain")}</button>} className="movies-grid-message" error icon="error_outline" title={t(k.loadFailed)}>{browse.error}</EmptyPanel>
            )}
            {hasMore && !showingFavorites && (canObserve
              ? <div aria-hidden="true" className="browse-sentinel movies-grid-message" ref={sentinelRef} />
              : <button className="text-button movies-grid-message" onClick={loadMore} type="button">{t("browse.loadMore")}</button>)}
          </div>
        </aside>
      </div>
    </section>
  );
}
