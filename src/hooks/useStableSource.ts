import { useState } from "react";
import type { Playlist } from "../types";

/**
 * The same source object for as long as how to reach it is the same. The app rebuilds its source objects whenever local data is
 * reloaded (a refresh, a favorite, the guide), and a browser made from a new object would throw away what it already loaded
 * and show skeletons again.
 */
export function useStableSource(source: Playlist | undefined): Playlist | undefined {
  const key = source
    ? [source.id, source.type, source.url, source.username, source.password, source.userAgent, source.macAddress, source.fileName, source.lastCatalogRefreshAt].join("\u0000")
    : "";
  const [kept, setKept] = useState({ key, source });
  if (kept.key !== key) setKept({ key, source });
  return kept.key === key ? kept.source : source;
}
