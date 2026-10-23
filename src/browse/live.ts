import { loadXtreamLiveCategories, loadXtreamLiveChannels } from "../providers/xtream";
import { loadStalkerChannels } from "../providers/stalker";
import type { LiveChannel, Playlist } from "../types";
import { BROWSE_PAGE_SIZE, type BrowseCategory, type BrowsePage } from "./types";

/**
 * Live TV read per category, one batch at a time, instead of copied into the database first.
 * Whatever a source returns for a category is kept in memory for the session, so paging back and forth is free.
 */
export interface LiveBrowser {
  categories(signal?: AbortSignal): Promise<BrowseCategory[]>;
  /** `categoryId` null is "All". `cursor` is the value of the previous batch's `nextCursor`. */
  page(categoryId: string | null, cursor?: string, signal?: AbortSignal): Promise<BrowsePage<LiveChannel>>;
}

function slice(channels: LiveChannel[], cursor: string | undefined): BrowsePage<LiveChannel> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + BROWSE_PAGE_SIZE;
  return {
    items: channels.slice(start, end),
    nextCursor: end < channels.length ? String(end) : undefined,
    total: channels.length,
  };
}

/** Groups of a channel list as categories, with counts; "All" is not one of them (it is the null category). */
function groupsOf(channels: LiveChannel[]): BrowseCategory[] {
  const counts = new Map<string, number>();
  for (const channel of channels) counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ id: name, name, count }));
}

/** M3U has no server to ask: its channels are parsed once and kept, so categories are just their groups. */
function fromChannels(load: (signal?: AbortSignal) => Promise<LiveChannel[]>): LiveBrowser {
  let loaded: Promise<LiveChannel[]> | undefined;
  const all = (signal?: AbortSignal) => (loaded ??= load(signal).catch((error) => { loaded = undefined; throw error; }));
  return {
    categories: async (signal) => groupsOf(await all(signal)),
    page: async (categoryId, cursor, signal) => {
      const channels = await all(signal);
      return slice(categoryId === null ? channels : channels.filter((channel) => channel.group === categoryId), cursor);
    },
  };
}

function xtreamBrowser(playlist: Playlist): LiveBrowser {
  let categories: Promise<BrowseCategory[]> | undefined;
  const lists = new Map<string, Promise<LiveChannel[]>>();
  const loadCategories = (signal?: AbortSignal) =>
    (categories ??= loadXtreamLiveCategories(playlist, signal).catch((error) => { categories = undefined; throw error; }));
  return {
    categories: loadCategories,
    page: async (categoryId, cursor, signal) => {
      const key = categoryId ?? "";
      let list = lists.get(key);
      if (!list) {
        list = loadCategories(signal)
          .then((known) => loadXtreamLiveChannels(playlist, categoryId, known, signal))
          .catch((error) => { lists.delete(key); throw error; });
        lists.set(key, list);
      }
      return slice(await list, cursor);
    },
  };
}

export function createLiveBrowser(playlist: Playlist, storedChannels: () => Promise<LiveChannel[]>): LiveBrowser {
  if (playlist.type === "XTREAM") return xtreamBrowser(playlist);
  // A portal lists every live channel in one answer, so it is read once and then grouped here.
  if (playlist.type === "STALKER") return fromChannels((signal) => loadStalkerChannels(playlist, signal));
  return fromChannels(storedChannels);
}
