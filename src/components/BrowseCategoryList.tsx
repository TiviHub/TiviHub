import { useState } from "react";
import type { BrowseCategory } from "../browse/types";
import { Icon } from "./common";
import { RowSkeletons } from "./Skeleton";

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
}: {
  title: string;
  categories: BrowseCategoryEntry[];
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle ? categories.filter((category) => category.pinned || category.name.toLowerCase().includes(needle)) : categories;
  return (
    <aside aria-label={title} className="live-channel-sidebar browse-category-panel">
      <div className="live-channel-sidebar-heading">
        <h2>{title}</h2>
        <span>{categories.filter((category) => !category.pinned && category.id !== "").length.toLocaleString()}</span>
      </div>
      <div className="browse-category-search">
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">Filter categories</span>
          <input onChange={(event) => setFilter(event.target.value)} placeholder="Filter categories" value={filter} />
        </label>
      </div>
      <div className="live-channel-list browse-category-list">
        {loading && (
          <div aria-live="polite" role="status">
            <span className="sr-only">Loading categories…</span>
            <RowSkeletons count={8} />
          </div>
        )}
        {error && (
          <div className="browse-message" role="alert">
            <p>{error}</p>
            <button className="text-button" onClick={onRetry} type="button">Try again</button>
          </div>
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
            {category.count !== undefined && <span className="browse-category-count">{category.count.toLocaleString()}</span>}
          </button>
        ))}
        {!loading && !error && shown.length === 0 && <p className="browse-message">No categories match.</p>}
      </div>
    </aside>
  );
}
