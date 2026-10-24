import { BROWSE_PAGE_SIZE, type Browser, type BrowseCategory, type BrowsePage, type BrowseSort } from "./types";

/** One batch of an in-memory list, optionally filtered by name; the cursor is the offset of the next batch. */
export function slicePage<T extends { name: string }>(items: T[], cursor: string | undefined, query: string | undefined, sort: BrowseSort = "default"): BrowsePage<T> {
  const needle = query?.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  const matching = sort === "default" ? filtered : sortByName(filtered, sort);
  const start = cursor ? Number(cursor) : 0;
  const end = start + BROWSE_PAGE_SIZE;
  return {
    items: matching.slice(start, end),
    nextCursor: end < matching.length ? String(end) : undefined,
    total: matching.length,
  };
}

/** A copy ordered by name, numbers by value ("Channel 2" before "Channel 10"). */
export function sortByName<T extends { name: string }>(items: T[], sort: "az" | "za"): T[] {
  const direction = sort === "za" ? -1 : 1;
  return [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) * direction);
}

/**
 * Lets one caller stop waiting for a shared request without cancelling it for the others.
 * Browsing shares each request (a category, the category list) between screens and re-asks when a screen is replaced or
 * re-mounted, so a request must never be tied to the signal of whoever asked first: that one gives up and everybody
 * else would be handed its AbortError.
 */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Remembers a successful answer; a failed one is forgotten so the next call tries again. The request itself has no signal (see `abortable`). */
export function remember<T>(load: () => Promise<T>): (signal?: AbortSignal) => Promise<T> {
  let value: Promise<T> | undefined;
  return (signal) => abortable(value ??= load().catch((error) => { value = undefined; throw error; }), signal);
}

/** A stored answer and when it was saved. */
export interface Stored<T> {
  items: T[];
  savedAt: number;
}

/** Where the last answer for a category, and the category list, is kept between sessions. */
export interface ListCache<T> {
  get(key: string): Promise<Stored<T> | undefined>;
  put(key: string, items: T[]): Promise<void>;
  getCategories(): Promise<Stored<BrowseCategory> | undefined>;
  putCategories(categories: BrowseCategory[]): Promise<void>;
}

/** A stored answer older than this is not shown as if it were current; it is fetched first (and still used if that fails). */
export const BROWSE_CACHE_MAX_AGE_MILLIS = 7 * 24 * 60 * 60 * 1000;

const sameAnswer = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
/** The same categories, whatever counts they carry: a refreshed list has none until the whole answer is in. */
const sameCategories = (left: BrowseCategory[], right: BrowseCategory[]) =>
  sameAnswer(left.map(({ id, name }) => ({ id, name })), right.map(({ id, name }) => ({ id, name })));

/**
 * A source that answers one category per request and can take seconds (Xtream).
 * - A stored answer opens at once; a fresh one is fetched behind it, stored, and announced to `subscribe`rs when it differs.
 * - A stored answer older than BROWSE_CACHE_MAX_AGE_MILLIS is fetched first; if that fails the old answer is still shown.
 * - Within a session each answer is asked for once.
 */
export function cachedBrowser<T extends { name: string }>(
  source: {
    categories(signal?: AbortSignal): Promise<BrowseCategory[]>;
    list(categoryId: string, categories: BrowseCategory[], signal?: AbortSignal): Promise<T[]>;
    /**
     * Every item in one answer (an empty category id), when the provider has such a request. It is asked for once the
     * category list is known, behind the screen: the answer gives each category its count and its items, and is kept.
     */
    all?: { categoryOf(item: T): string | undefined };
  },
  cache?: ListCache<T>,
  now: () => number = Date.now,
): Browser<T> {
  const listeners = new Set<(categoryId: string | undefined) => void>();
  const announce = (categoryId: string | undefined) => listeners.forEach((listener) => listener(categoryId));
  const isOld = (stored: Stored<unknown>) => now() - stored.savedAt > BROWSE_CACHE_MAX_AGE_MILLIS;

  const fetchCategories = async () => {
    const fresh = await source.categories();
    void cache?.putCategories(withCounts(fresh)).catch(() => undefined);
    return fresh;
  };
  let categoriesAnswer: Promise<BrowseCategory[]> | undefined;
  // Counts learned from the "everything" answer; a refreshed category list keeps them.
  let counts: Map<string, number> | undefined;
  const withCounts = (list: BrowseCategory[]) =>
    (counts ? list.map((category) => (counts!.has(category.id) ? { ...category, count: counts!.get(category.id) } : category)) : list);
  const sharedCategories = () => (categoriesAnswer ??= (async () => {
    const stored = await cache?.getCategories().catch(() => undefined);
    if (!stored?.items.length) return fetchCategories();
    if (isOld(stored)) return fetchCategories().catch(() => stored.items);
    // Counts shown last time stay until the new ones are known; the refreshed list itself has none.
    const storedCounts = stored.items.filter((category) => category.count !== undefined);
    if (storedCounts.length) counts = new Map(storedCounts.map((category) => [category.id, category.count!]));
    fetchCategories().then((fresh) => {
      if (sameCategories(fresh, stored.items)) return;
      categoriesAnswer = Promise.resolve(withCounts(fresh));
      announce(undefined);
    }, () => undefined);
    return stored.items;
  })().catch((error) => { categoriesAnswer = undefined; throw error; }));
  const categories = (signal?: AbortSignal) => abortable(sharedCategories().then((known) => { startAll(known); return known; }), signal);

  const fetchFresh = async (key: string) => {
    const items = await source.list(key, await sharedCategories());
    void cache?.put(key, items).catch(() => undefined);
    return items;
  };
  const lists = new Map<string, Promise<T[]>>();
  // The "everything" answer, when the provider has one: counts for the category list and every category's items at once.
  const ALL_KEY = "@@all";
  let allStarted = false;
  const applyAll = (items: T[], knownCategories: BrowseCategory[]) => {
    const byCategory = new Map<string, T[]>(knownCategories.map((category) => [category.id, []]));
    for (const item of items) {
      const id = source.all!.categoryOf(item);
      if (id !== undefined && byCategory.has(id)) byCategory.get(id)!.push(item);
    }
    for (const [id, group] of byCategory) lists.set(id, Promise.resolve(group));
    counts = new Map([...byCategory].map(([id, group]) => [id, group.length]));
    const counted = withCounts(knownCategories);
    categoriesAnswer = Promise.resolve(counted);
    void cache?.putCategories(counted).catch(() => undefined);
    announce(undefined);
  };
  const startAll = (knownCategories: BrowseCategory[]) => {
    if (!source.all || allStarted) return;
    allStarted = true;
    void (async () => {
      const stored = await cache?.get(ALL_KEY).catch(() => undefined);
      if (stored?.items.length) applyAll(stored.items, knownCategories);
      if (stored && !isOld(stored) && stored.items.length) return;
      const fresh = await source.list("", knownCategories);
      void cache?.put(ALL_KEY, fresh).catch(() => undefined);
      applyAll(fresh, knownCategories);
    })().catch(() => { allStarted = false; });
  };
  const list = (key: string, signal?: AbortSignal) => {
    let value = lists.get(key);
    if (!value) {
      value = (async () => {
        const stored = await cache?.get(key).catch(() => undefined);
        if (!stored?.items.length) return fetchFresh(key);
        if (isOld(stored)) return fetchFresh(key).catch(() => stored.items);
        fetchFresh(key).then((fresh) => {
          if (sameAnswer(fresh, stored.items)) return;
          lists.set(key, Promise.resolve(fresh));
          announce(key);
        }, () => undefined);
        return stored.items;
      })().catch((error) => { lists.delete(key); throw error; });
      lists.set(key, value);
    }
    return abortable(value, signal);
  };
  return {
    categories,
    page: async (categoryId, cursor, query, signal, sort) => slicePage(await list(categoryId ?? "", signal), cursor, query, sort),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
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
  load: () => Promise<T[]>,
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
    page: async (categoryId, cursor, query, signal, sort) => slicePage(await itemsOf(categoryId, signal), cursor, query, sort),
    itemsOf,
  };
}

/**
 * A source that hands out a category a few items at a time and has far too many to read whole (a Stalker portal:
 * 14 per request, hundreds of thousands of titles). The cursor is the source's own position; the category list is read once.
 * Every batch is also given to `cache.put`, which is how browsed titles reach the device's storage; it is never read back.
 * shortcut: no stored copy shown before the fetch, upgrade when portal categories feel slow to open.
 */
export function pagedBrowser<T>(
  source: {
    categories(signal?: AbortSignal): Promise<BrowseCategory[]>;
    /** How many items a category holds, when that costs one small request; read in the background for the category list. */
    count?(categoryId: string): Promise<number | undefined>;
    page(
      categoryId: string | null,
      categories: BrowseCategory[],
      options: { cursor?: string; query?: string; sort: BrowseSort },
      signal?: AbortSignal,
    ): Promise<BrowsePage<T>>;
  },
  cache?: ListCache<T>,
): Browser<T> {
  const listeners = new Set<(categoryId: string | undefined) => void>();
  const counts = new Map<string, number>();
  const withCounts = (list: BrowseCategory[]) => list.map((category) => (counts.has(category.id) ? { ...category, count: counts.get(category.id) } : category));
  let counting = false;
  // Two requests at a time, so opening a category is never queued behind a long run of counts; a failure ends the run quietly.
  const countAll = async (list: BrowseCategory[]) => {
    if (counting || !source.count) return;
    counting = true;
    const stored = await cache?.getCategories().catch(() => undefined);
    for (const category of stored && Date.now() - stored.savedAt < BROWSE_CACHE_MAX_AGE_MILLIS ? stored.items : []) {
      if (category.count !== undefined) counts.set(category.id, category.count);
    }
    if (list.every((category) => counts.has(category.id))) return listeners.forEach((listener) => listener(undefined));
    const pending = list.filter((category) => !counts.has(category.id));
    let done = 0;
    const worker = async () => {
      for (let category = pending.shift(); category; category = pending.shift()) {
        const count = await source.count!(category.id);
        if (count !== undefined) counts.set(category.id, count);
        if (++done % 10 === 0) listeners.forEach((listener) => listener(undefined));
      }
    };
    await Promise.all([worker(), worker()]).catch(() => undefined);
    listeners.forEach((listener) => listener(undefined));
    void cache?.putCategories(withCounts(list)).catch(() => undefined);
  };
  const known = remember(() => source.categories());
  const categories = async (signal?: AbortSignal) => {
    const list = await known(signal);
    void countAll(list);
    return withCounts(list);
  };
  return {
    categories,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    page: async (categoryId, cursor, query, signal, sort = "default") => {
      const list = await known(signal);
      const result = await source.page(categoryId, list, { cursor, query, sort }, signal);
      void cache?.put(`${categoryId ?? ""}:${query ?? ""}:${cursor ?? ""}`, result.items).catch(() => undefined);
      return result;
    },
  };
}
