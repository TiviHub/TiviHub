import { useEffect, useRef, useState } from "react";
import type { BrowseCategory, BrowseSort } from "../browse/types";
import { formatNumber, t } from "../lib/i18n";
import { ScrollToTop, SearchField } from "./common";
import { EmptyPanel } from "./EmptyPanel";
import { BrowseSortButton } from "./BrowseSortButton";
import { CategorySkeletons } from "./Skeleton";

export interface BrowseCategoryEntry extends BrowseCategory {
  /** Entries that are not categories of the source (Favorites); they sit above the real ones. */
  pinned?: boolean;
}

/** The left panel of a browsing screen: the source's categories, filterable, one selected at a time. */
export function BrowseCategoryList({
  title,
  categories,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  scroll,
}: {
  title: string;
  categories: BrowseCategoryEntry[];
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  /** Remembers the list's scroll position for the page that owns it, so coming back finds the same place. */
  scroll?: { get: () => number; set: (top: number) => void };
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<BrowseSort>("default");
  const listRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef(0);
  useEffect(() => { restoreTo.current = scroll?.get() ?? 0;
  }, [scroll]);
  const ready = !loading && categories.length > 0;
  useEffect(() => {
    if (!ready || !restoreTo.current || !listRef.current) return;
    listRef.current.scrollTop = restoreTo.current;
    restoreTo.current = 0;
  }, [ready]);
  const needle = filter.trim().toLowerCase();
  const matching = needle ? categories.filter((category) => category.pinned || category.name.toLowerCase().includes(needle)) : categories;
  // Pinned entries (Favorites, All) stay on top; only the source's own categories are reordered.
  const byName = (left: BrowseCategoryEntry, right: BrowseCategoryEntry) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) * (sort === "za" ? -1 : 1);
  const shown = sort === "default"
    ? matching
    : [...matching.filter((category) => category.pinned), ...matching.filter((category) => !category.pinned).sort(byName)];
  return (
    <aside aria-label={title} className="live-channel-sidebar browse-category-panel">
      <div className="live-channel-sidebar-heading">
        <h2>{title}</h2>
        <span>{formatNumber(categories.filter((category) => !category.pinned && category.id !== "").length)}</span>
      </div>
      <div className="browse-panel-tools">
        <SearchField label={t("categories.filter")} onChange={setFilter} placeholder={t("categories.filter")} value={filter} />
        <BrowseSortButton label={t("categories.sort")} onChange={setSort} value={sort} />
      </div>
      <div className={`live-channel-list browse-list${loading ? " is-loading" : ""}`} onScroll={(event) => { if (!restoreTo.current) scroll?.set(event.currentTarget.scrollTop); }} ref={listRef}>
        {error && (
          <EmptyPanel action={<button className="secondary-button" onClick={onRetry} type="button">{t("common.tryAgain")}</button>} error icon="error_outline" title={t("categories.loadFailed")}>{error}</EmptyPanel>
        )}
        {shown.map((category) => (
          <button
            aria-pressed={selectedId === (category.id === "" ? null : category.id)}
            className={`browse-category${selectedId === (category.id === "" ? null : category.id) ? " active" : ""}`}
            key={category.id || "all"}
            onClick={() => onSelect(category.id === "" ? null : category.id)}
            type="button"
          >
            <span className="browse-category-name">{category.name}</span>
            {category.count !== undefined && <span className="browse-category-count">{formatNumber(category.count)}</span>}
          </button>
        ))}
        {loading && (
          <div aria-live="polite" role="status">
            <span className="sr-only">{t("categories.loading")}</span>
            <CategorySkeletons count={24} />
          </div>
        )}
        {!loading && !error && shown.length === 0 && <EmptyPanel icon="search" title={t("categories.noMatchesTitle")}>{t("categories.noMatchesBody")}</EmptyPanel>}
      </div>
      <ScrollToTop listRef={listRef} />
    </aside>
  );
}
