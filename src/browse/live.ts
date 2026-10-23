import { loadXtreamLiveCategories, loadXtreamLiveChannels } from "../providers/xtream";
import { loadStalkerChannels } from "../providers/stalker";
import type { LiveChannel, Playlist } from "../types";
import { memoryBrowser, remember, rememberByKey, slicePage } from "./lists";
import type { Browser } from "./types";

/** Not a real group name: picks every channel marked as a radio station. */
export const RADIO_CATEGORY_ID = "@@radio";

/**
 * Live TV read per category, one batch at a time, instead of copied into the database first.
 * Whatever a source returns for a category is kept in memory for the session, so paging back and forth is free.
 */
export interface LiveBrowser extends Browser<LiveChannel> {
  /** Every channel of a category, for actions on the whole group (stream health check). */
  channelsOf(categoryId: string | null, signal?: AbortSignal): Promise<LiveChannel[]>;
}

/** A source that lists every channel in one answer (M3U, portal): read once, then grouped here. */
function fromChannels(load: (signal?: AbortSignal) => Promise<LiveChannel[]>): LiveBrowser {
  const browser = memoryBrowser(load, {
    groupOf: (channel) => channel.group,
    extraCategories: (channels) => {
      const radio = channels.filter((channel) => channel.radio).length;
      return radio > 0 ? [{ id: RADIO_CATEGORY_ID, name: "Radio", count: radio }] : [];
    },
    inCategory: (channel, categoryId) => categoryId === RADIO_CATEGORY_ID ? Boolean(channel.radio) : channel.group === categoryId,
  });
  return { categories: browser.categories, page: browser.page, channelsOf: browser.itemsOf };
}

function xtreamBrowser(playlist: Playlist): LiveBrowser {
  const categories = remember((signal) => loadXtreamLiveCategories(playlist, signal));
  const list = rememberByKey(async (key, signal) =>
    loadXtreamLiveChannels(playlist, key || null, await categories(signal), signal));
  const channelsOf = (categoryId: string | null, signal?: AbortSignal) => list(categoryId ?? "", signal);
  return {
    categories,
    page: async (categoryId, cursor, query, signal) => slicePage(await channelsOf(categoryId, signal), cursor, query),
    channelsOf,
  };
}

export function createLiveBrowser(playlist: Playlist, storedChannels: () => Promise<LiveChannel[]>): LiveBrowser {
  if (playlist.type === "XTREAM") return xtreamBrowser(playlist);
  if (playlist.type === "STALKER") return fromChannels((signal) => loadStalkerChannels(playlist, signal));
  return fromChannels(storedChannels);
}
