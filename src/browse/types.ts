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

/** What a browsing screen needs from a source, whatever the section or provider. */
export interface Browser<T> {
  categories(signal?: AbortSignal): Promise<BrowseCategory[]>;
  /** `categoryId` null is "All". `cursor` is the previous batch's `nextCursor`. `query` filters by name. */
  page(categoryId: string | null, cursor?: string, query?: string, signal?: AbortSignal): Promise<BrowsePage<T>>;
}
