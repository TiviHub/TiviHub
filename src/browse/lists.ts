import { BROWSE_PAGE_SIZE, type Browser, type BrowseCategory, type BrowsePage } from "./types";

/** One batch of an in-memory list, optionally filtered by name; the cursor is the offset of the next batch. */
export function slicePage<T extends { name: string }>(items: T[], cursor: string | undefined, query: string | undefined): BrowsePage<T> {
  const needle = query?.trim().toLowerCase();
  const matching = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  const start = cursor ? Number(cursor) : 0;
  const end = start + BROWSE_PAGE_SIZE;
  return {
    items: matching.slice(start, end),
    nextCursor: end < matching.length ? String(end) : undefined,
    total: matching.length,
  };
}

/** Remembers a successful answer; a failed one is forgotten so the next call tries again. */
export function remember<T>(load: (signal?: AbortSignal) => Promise<T>): (signal?: AbortSignal) => Promise<T> {
  let value: Promise<T> | undefined;
  return (signal) => (value ??= load(signal).catch((error) => { value = undefined; throw error; }));
}

/** Like `remember`, per key. */
export function rememberByKey<T>(load: (key: string, signal?: AbortSignal) => Promise<T>): (key: string, signal?: AbortSignal) => Promise<T> {
  const values = new Map<string, Promise<T>>();
  return (key, signal) => {
    let value = values.get(key);
    if (!value) {
      value = load(key, signal).catch((error) => { values.delete(key); throw error; });
      values.set(key, value);
    }
    return value;
  };
}

/** Categories of an item list: its groups, with counts, in the order they first appear. */
export function groupsOf<T>(items: T[], groupOf: (item: T) => string | undefined): BrowseCategory[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const group = groupOf(item);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ id: name, name, count }));
}

/** A source that hands over every item in one answer (M3U, a portal's channel list): read once, then grouped here. */
export function memoryBrowser<T extends { name: string }>(
  load: (signal?: AbortSignal) => Promise<T[]>,
  options: {
    groupOf: (item: T) => string | undefined;
    /** Categories that are not plain groups (Radio), ahead of the groups. */
    extraCategories?: (items: T[]) => BrowseCategory[];
    inCategory?: (item: T, categoryId: string) => boolean;
  },
): Browser<T> & { itemsOf(categoryId: string | null, signal?: AbortSignal): Promise<T[]> } {
  const all = remember(load);
  const inCategory = options.inCategory ?? ((item, categoryId) => options.groupOf(item) === categoryId);
  const itemsOf = async (categoryId: string | null, signal?: AbortSignal) => {
    const items = await all(signal);
    return categoryId === null ? items : items.filter((item) => inCategory(item, categoryId));
  };
  return {
    categories: async (signal) => {
      const items = await all(signal);
      return [...(options.extraCategories?.(items) ?? []), ...groupsOf(items, options.groupOf)];
    },
    page: async (categoryId, cursor, query, signal) => slicePage(await itemsOf(categoryId, signal), cursor, query),
    itemsOf,
  };
}
