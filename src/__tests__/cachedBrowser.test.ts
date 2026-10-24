// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BROWSE_CACHE_MAX_AGE_MILLIS, cachedBrowser, memoryBrowser, type ListCache, type Stored } from "../browse/lists";
import type { BrowseCategory } from "../browse/types";
import { useBrowse } from "../hooks/useBrowse";

type Item = { name: string };
const item = (name: string): Item => ({ name });
const categories: BrowseCategory[] = [{ id: "1", name: "News" }];

function memoryCache(items: Item[] | undefined, savedAt: number, storedCategories: BrowseCategory[] | undefined = categories): ListCache<Item> & { put: ReturnType<typeof vi.fn>; putCategories: ReturnType<typeof vi.fn> } {
  const stored = (value: Item[] | undefined): Stored<Item> | undefined => (value ? { items: value, savedAt } : undefined);
  return {
    get: async () => stored(items),
    put: vi.fn(async () => undefined),
    getCategories: async () => (storedCategories ? { items: storedCategories, savedAt } : undefined),
    putCategories: vi.fn(async () => undefined),
  };
}

const NOW = 10 * BROWSE_CACHE_MAX_AGE_MILLIS;

describe("cachedBrowser", () => {
  it("opens from a stored answer without waiting for the provider", async () => {
    const list = vi.fn(() => new Promise<Item[]>(() => undefined));
    const browser = cachedBrowser({ categories: async () => categories, list }, memoryCache([item("Old")], NOW), () => NOW);
    expect((await browser.page("1")).items).toEqual([item("Old")]);
  });

  it("announces a fresher answer, serves it next, and stays quiet when nothing changed", async () => {
    const list = vi.fn(async () => [item("New")]);
    const cache = memoryCache([item("Old")], NOW);
    const browser = cachedBrowser({ categories: async () => categories, list }, cache, () => NOW);
    const heard = vi.fn();
    browser.subscribe!(heard);

    await browser.page("1");
    await vi.waitFor(() => expect(heard).toHaveBeenCalledWith("1"));
    expect((await browser.page("1")).items).toEqual([item("New")]);
    expect(cache.put).toHaveBeenCalledWith("1", [item("New")]);

    const same = vi.fn(async () => [item("Old")]);
    const quiet = cachedBrowser({ categories: async () => categories, list: same }, memoryCache([item("Old")], NOW), () => NOW);
    const quietHeard = vi.fn();
    quiet.subscribe!(quietHeard);
    await quiet.page("1");
    await vi.waitFor(() => expect(same).toHaveBeenCalled());
    await Promise.resolve();
    expect(quietHeard).not.toHaveBeenCalled();
  });

  it("announces a fresher category list under undefined", async () => {
    const fresh = [{ id: "1", name: "News" }, { id: "2", name: "Sport" }];
    const browser = cachedBrowser({ categories: async () => fresh, list: async () => [] }, memoryCache(undefined, NOW), () => NOW);
    const heard = vi.fn();
    browser.subscribe!(heard);
    expect(await browser.categories()).toEqual(categories);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledWith(undefined));
    expect(await browser.categories()).toEqual(fresh);
  });

  it("fetches an answer older than the age limit first, and falls back to it when the provider fails", async () => {
    const old = NOW - BROWSE_CACHE_MAX_AGE_MILLIS - 1;
    const list = vi.fn(async () => [item("Fresh")]);
    const fetchedFirst = cachedBrowser({ categories: async () => categories, list }, memoryCache([item("Old")], old), () => NOW);
    expect((await fetchedFirst.page("1")).items).toEqual([item("Fresh")]);

    const offline = cachedBrowser({ categories: async () => categories, list: async () => { throw new Error("offline"); } }, memoryCache([item("Old")], old), () => NOW);
    expect((await offline.page("1")).items).toEqual([item("Old")]);
  });

  it("fails when there is nothing stored and the provider fails, and tries again next time", async () => {
    const list = vi.fn<() => Promise<Item[]>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([item("Back")]);
    const browser = cachedBrowser({ categories: async () => categories, list }, memoryCache(undefined, NOW), () => NOW);
    await expect(browser.page("1")).rejects.toThrow("offline");
    expect((await browser.page("1")).items).toEqual([item("Back")]);
  });
});

describe("useBrowse with a refreshed answer", () => {
  const options = (browser: ReturnType<typeof cachedBrowser<Item>>) => ({
    browser, supportsAll: false, isAdult: () => false, showAdultContent: true, chosenCategoryId: "1" as string | null, query: "",
  });

  it("swaps the open list to the fresh answer", async () => {
    const browser = cachedBrowser({ categories: async () => categories, list: async () => [item("New")] }, memoryCache([item("Old")], NOW), () => NOW);
    const { result } = renderHook(() => useBrowse(options(browser)));
    await waitFor(() => expect(result.current.items).toEqual([item("New")]));
    expect(result.current.loading).toBe(false);
  });

  it("keeps a list you have scrolled on", async () => {
    const many = Array.from({ length: 130 }, (_, index) => item(`Old ${index}`));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const browser = cachedBrowser({ categories: async () => categories, list: async () => { await gate; return [item("New")]; } }, memoryCache(many, NOW), () => NOW);
    const heard = vi.fn();
    browser.subscribe!(heard);
    const { result } = renderHook(() => useBrowse(options(browser)));
    await waitFor(() => expect(result.current.items).toHaveLength(60));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(120));
    release();
    await waitFor(() => expect(heard).toHaveBeenCalled());
    expect(result.current.items).toHaveLength(120);
  });
});

describe("a request that one screen gave up on", () => {
  // The provider call honours its signal, like a real fetch.
  const listThatHonoursTheSignal = (answer: Item[]) => vi.fn((_key: string, _categories: BrowseCategory[], signal?: AbortSignal) =>
    new Promise<Item[]>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      const timer = setTimeout(() => resolve(answer), 20);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
    }));

  // React's strict mode, and a quick click away and back, ask again in the same tick the first request was given up.
  it("is not cancelled for the next screen that asks for the same category", async () => {
    const list = listThatHonoursTheSignal([item("Answer")]);
    const browser = cachedBrowser({ categories: async () => categories, list }, memoryCache(undefined, NOW), () => NOW);
    const first = new AbortController();
    const given = browser.page("1", undefined, "", first.signal);
    first.abort();
    const next = browser.page("1", undefined, "", new AbortController().signal);

    await expect(given).rejects.toMatchObject({ name: "AbortError" });
    expect((await next).items).toEqual([item("Answer")]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("is not cancelled for the next screen that asks for the category list", async () => {
    const slow = vi.fn((signal?: AbortSignal) => new Promise<BrowseCategory[]>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      const timer = setTimeout(() => resolve(categories), 20);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
    }));
    const browser = cachedBrowser({ categories: slow, list: async () => [] }, memoryCache(undefined, NOW, undefined), () => NOW);
    const first = new AbortController();
    const given = browser.categories(first.signal);
    first.abort();
    const next = browser.categories(new AbortController().signal);

    await expect(given).rejects.toMatchObject({ name: "AbortError" });
    expect(await next).toEqual(categories);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("is not cancelled for the next screen that asks for an in-memory source's list", async () => {
    const load = vi.fn((signal?: AbortSignal) => new Promise<Item[]>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      const timer = setTimeout(() => resolve([item("A")]), 20);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
    }));
    const browser = memoryBrowser(load, { groupOf: () => "Group" });
    const first = new AbortController();
    const given = browser.categories(first.signal);
    first.abort();
    const next = browser.categories(new AbortController().signal);

    await expect(given).rejects.toMatchObject({ name: "AbortError" });
    expect(await next).toEqual([{ id: "Group", name: "Group", count: 1 }]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("a provider that can answer with everything", () => {
  type Movie = { name: string; categoryId: string };
  const movie = (name: string, categoryId: string): Movie => ({ name, categoryId });
  const cats: BrowseCategory[] = [{ id: "1", name: "News" }, { id: "2", name: "Sport" }, { id: "3", name: "Empty" }];
  const everything = [movie("A", "1"), movie("B", "1"), movie("C", "2")];

  it("gives every category its count and its items once the whole answer is in, and asks for it only once", async () => {
    const list = vi.fn(async (key: string) => (key === "" ? everything : everything.filter((entry) => entry.categoryId === key)));
    const browser = cachedBrowser<Movie>({ categories: async () => cats, list, all: { categoryOf: (entry) => entry.categoryId } }, memoryCache(undefined, NOW, []) as unknown as ListCache<Movie>, () => NOW);
    const heard = vi.fn();
    browser.subscribe!(heard);

    expect((await browser.categories()).every((category) => category.count === undefined)).toBe(true);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledWith(undefined));
    expect((await browser.categories()).map((category) => category.count)).toEqual([2, 1, 0]);
    expect((await browser.page("1")).items.map((entry) => entry.name)).toEqual(["A", "B"]);
    expect((await browser.page("3")).items).toEqual([]);
    await browser.categories();
    expect(list.mock.calls.filter(([key]) => key === "")).toHaveLength(1);
    expect(list.mock.calls.filter(([key]) => key !== "")).toHaveLength(0);
  });

  it("opens a category from its own request while the whole answer is still on its way", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const list = vi.fn(async (key: string) => {
      if (key === "") { await gate; return everything; }
      return everything.filter((entry) => entry.categoryId === key);
    });
    const browser = cachedBrowser<Movie>({ categories: async () => cats, list, all: { categoryOf: (entry) => entry.categoryId } }, memoryCache(undefined, NOW, []) as unknown as ListCache<Movie>, () => NOW);
    await browser.categories();
    expect((await browser.page("2")).items.map((entry) => entry.name)).toEqual(["C"]);
    release();
  });

  it("keeps the counts when the category list is refreshed behind a stored one", async () => {
    const list = vi.fn(async () => everything);
    const cache = memoryCache(undefined, NOW, cats) as unknown as ListCache<Movie>;
    const browser = cachedBrowser<Movie>({ categories: async () => [...cats, { id: "4", name: "New" }], list, all: { categoryOf: (entry) => entry.categoryId } }, cache, () => NOW);
    await browser.categories();
    await vi.waitFor(async () => expect((await browser.categories()).map((category) => category.id)).toContain("4"));
    expect((await browser.categories()).find((category) => category.id === "1")?.count).toBe(2);
  });
});

describe("counts that are already on screen", () => {
  type Movie = { name: string; categoryId: string };
  const movie = (name: string, categoryId: string): Movie => ({ name, categoryId });

  it("do not disappear while the category list is refreshed and the whole answer is on its way", async () => {
    const stored: BrowseCategory[] = [{ id: "1", name: "News", count: 2 }, { id: "2", name: "Sport", count: 1 }];
    const plain: BrowseCategory[] = [{ id: "1", name: "News" }, { id: "2", name: "Sport" }];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const list = vi.fn(async () => { await gate; return [movie("A", "1"), movie("B", "1"), movie("C", "2")]; });
    const cache = memoryCache(undefined, NOW, stored);
    const browser = cachedBrowser<Movie>(
      { categories: async () => plain, list, all: { categoryOf: (entry) => entry.categoryId } },
      cache as unknown as ListCache<Movie>,
      () => NOW,
    );
    const seen: (number | undefined)[][] = [];
    browser.subscribe!(() => void browser.categories().then((list) => seen.push(list.map((category) => category.count))));

    expect((await browser.categories()).map((category) => category.count)).toEqual([2, 1]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The refreshed list is the same categories: it is not announced, and the counts stay.
    expect((await browser.categories()).map((category) => category.count)).toEqual([2, 1]);
    release();
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.every((counts) => counts.every((count) => count !== undefined))).toBe(true);
    // What is stored for the next visit keeps the counts too.
    expect(cache.putCategories.mock.calls.every(([saved]) => (saved as BrowseCategory[]).every((category) => category.count !== undefined))).toBe(true);
  });
});

describe("useBrowse when its browser is replaced", () => {
  const slowBrowser = (name: string, gate: Promise<void>) => ({
    categories: async () => { await gate; return [{ id: "1", name: `${name} category`, count: 1 }]; },
    page: async () => { await gate; return { items: [item(`${name} item`)], total: 1 }; },
  });
  const options = (browser: ReturnType<typeof slowBrowser>, sourceKey: string) => ({
    browser, sourceKey, supportsAll: true, isAdult: () => false, showAdultContent: true, chosenCategoryId: null as string | null, query: "",
  });
  const open = Promise.resolve();

  it("keeps showing the old answer for the same source until the new one arrives", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { result, rerender } = renderHook(({ browser, key }) => useBrowse(options(browser, key)), { initialProps: { browser: slowBrowser("old", open), key: "a" } });
    await waitFor(() => expect(result.current.categories.map((category) => category.name)).toEqual(["old category"]));

    rerender({ browser: slowBrowser("new", gate), key: "a" });
    expect(result.current.categoriesLoading).toBe(false);
    expect(result.current.categories.map((category) => category.name)).toEqual(["old category"]);
    expect(result.current.items).toEqual([item("old item")]);
    expect(result.current.loading).toBe(false);

    release();
    await waitFor(() => expect(result.current.categories.map((category) => category.name)).toEqual(["new category"]));
    await waitFor(() => expect(result.current.items).toEqual([item("new item")]));
  });

  it("starts clean for another source", async () => {
    const gate = new Promise<void>(() => undefined);
    const { result, rerender } = renderHook(({ browser, key }) => useBrowse(options(browser, key)), { initialProps: { browser: slowBrowser("old", open), key: "a" } });
    await waitFor(() => expect(result.current.categories).toHaveLength(1));

    rerender({ browser: slowBrowser("other", gate), key: "b" });
    expect(result.current.categoriesLoading).toBe(true);
    expect(result.current.categories).toEqual([]);
    expect(result.current.items).toEqual([]);
  });
});
