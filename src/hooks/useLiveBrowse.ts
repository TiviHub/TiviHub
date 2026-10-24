import { useMemo } from "react";
import { createLiveBrowser } from "../browse/live";
import type { BrowseSort } from "../browse/types";
import { isAdultContent } from "../lib/adultContent";
import { browseCache } from "../services/browseCache";
import type { LiveChannel, Playlist } from "../types";
import { useBrowse } from "./useBrowse";
import { useStableSource } from "./useStableSource";

const isAdultChannel = (channel: LiveChannel) => isAdultContent(channel.name, channel.group);

/** Live TV categories and the channels of one category, loaded a batch at a time. */
export function useLiveBrowse({
  source: chosenSource,
  storedChannels,
  showAdultContent,
  chosenCategoryId,
  query,
  sort,
  paused = false,
}: {
  source: Playlist | undefined;
  /** M3U channels already stored on this device; other source types ignore it. */
  storedChannels: LiveChannel[];
  showAdultContent: boolean;
  chosenCategoryId: string | null | undefined;
  query: string;
  sort?: BrowseSort;
  paused?: boolean;
}) {
  const source = useStableSource(chosenSource);
  const stored = source?.type === "M3U" ? storedChannels : null;
  // A new or edited source, or a refreshed M3U catalog, starts a fresh browser; other types keep their cache.
  const browser = useMemo(() => (source ? createLiveBrowser(source, async () => stored ?? [], browseCache(source.id, "live")) : null), [source, stored]);
  return useBrowse({
    browser,
    sourceKey: source?.id,
    supportsAll: source?.type !== "XTREAM",
    isAdult: isAdultChannel,
    showAdultContent,
    chosenCategoryId,
    query,
    sort,
    paused,
  });
}
