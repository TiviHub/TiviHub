import { loadXtreamLiveCategories, loadXtreamLiveChannels } from "../providers/xtream";
import { loadStalkerChannels } from "../providers/stalker";
import type { LiveChannel, Playlist } from "../types";
import { BROWSE_PAGE_SIZE, type BrowseCategory, type BrowsePage } from "./types";

/** Not a real group name: picks every channel marked as a radio station. */
export const RADIO_CATEGORY_ID = "@@radio";

/**
 * Live TV read per category, one batch at a time, instead of copied into the database first.
 * Whatever a source returns for a category is kept in memory for the session, so paging back and forth is free.
 */
export interface LiveBrowser {
  categories(signal?: AbortSignal): Promise<BrowseCategory[]>;
  /** `categoryId` null is "All". `cursor` is the previous batch's `nextCursor`. `query` filters by channel name. */
  page(categoryId: string | null, cursor?: string, query?: string, signal?: AbortSignal): Promise<BrowsePage<LiveChannel>>;
  /** Every channel of a category, for actions on the whole group (stream health check). */
  channelsOf(categoryId: string | null, signal?: AbortSignal): Promise<LiveChannel[]>;
}

function slice(channels: LiveChannel[], cursor: string | undefined, query: string | undefined): BrowsePage<LiveChannel> {
  const needle = query?.trim().toLowerCase();
  const matching = needle ? channels.filter((channel) => channel.name.toLowerCase().includes(needle)) : channels;
  const start = cursor ? Number(cursor) : 0;
  const end = start + BROWSE_PAGE_SIZE;
  return {
    items: matching.slice(start, end),
    nextCursor: end < matching.length ? String(end) : undefined,
    total: matching.length,
  };
}

/** Groups of a channel list as categories, with counts; "All" is not one of them (it is the null category). */
function groupsOf(channels: LiveChannel[]): BrowseCategory[] {
  const counts = new Map<string, number>();
  let radio = 0;
  for (const channel of channels) {
    counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
    if (channel.radio) radio += 1;
  }
  const groups = [...counts].map(([name, count]) => ({ id: name, name, count }));
  return radio > 0 ? [{ id: RADIO_CATEGORY_ID, name: "Radio", count: radio }, ...groups] : groups;
}

function inCategory(channels: LiveChannel[], categoryId: string | null): LiveChannel[] {
  if (categoryId === null) return channels;
  return channels.filter((channel) => categoryId === RADIO_CATEGORY_ID ? channel.radio : channel.group === categoryId);
}

/** Remembers a successful answer; a failed one is forgotten so the next call tries again. */
function remember<T>(load: (signal?: AbortSignal) => Promise<T>): (signal?: AbortSignal) => Promise<T> {
  let value: Promise<T> | undefined;
  return (signal) => (value ??= load(signal).catch((error) => { value = undefined; throw error; }));
}

/** A source that lists every channel in one answer (M3U, portal): read once, then grouped here. */
function fromChannels(load: (signal?: AbortSignal) => Promise<LiveChannel[]>): LiveBrowser {
  const all = remember(load);
  const channelsOf = async (categoryId: string | null, signal?: AbortSignal) => inCategory(await all(signal), categoryId);
  return {
    categories: async (signal) => groupsOf(await all(signal)),
    page: async (categoryId, cursor, query, signal) => slice(await channelsOf(categoryId, signal), cursor, query),
    channelsOf,
  };
}

function xtreamBrowser(playlist: Playlist): LiveBrowser {
  const categories = remember((signal) => loadXtreamLiveCategories(playlist, signal));
  const lists = new Map<string, Promise<LiveChannel[]>>();
  const channelsOf = (categoryId: string | null, signal?: AbortSignal) => {
    const key = categoryId ?? "";
    let list = lists.get(key);
    if (!list) {
      list = categories(signal)
        .then((known) => loadXtreamLiveChannels(playlist, categoryId, known, signal))
        .catch((error) => { lists.delete(key); throw error; });
      lists.set(key, list);
    }
    return list;
  };
  return {
    categories,
    page: async (categoryId, cursor, query, signal) => slice(await channelsOf(categoryId, signal), cursor, query),
    channelsOf,
  };
}

export function createLiveBrowser(playlist: Playlist, storedChannels: () => Promise<LiveChannel[]>): LiveBrowser {
  if (playlist.type === "XTREAM") return xtreamBrowser(playlist);
  if (playlist.type === "STALKER") return fromChannels((signal) => loadStalkerChannels(playlist, signal));
  return fromChannels(storedChannels);
}
