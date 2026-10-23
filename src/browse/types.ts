/** A category of a section (Live TV, Movies or Series) as the source names it. */
export interface BrowseCategory {
  id: string;
  name: string;
  /** Only when the source says it up front; never worth a request of its own. */
  count?: number;
}

/** One batch of a category. `nextCursor` is absent on the last batch. */
export interface BrowsePage<T> {
  items: T[];
  nextCursor?: string;
  /** Total in the category when the source reports it. */
  total?: number;
}

/** Items per batch the screens ask for; sources with their own page size (Stalker: 14) fill batches up to this. */
export const BROWSE_PAGE_SIZE = 60;
