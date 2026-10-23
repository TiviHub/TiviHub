import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { startStalkerKeepAlive } from "../providers/stalker";
import type { Playlist } from "../types";

/** Keeps a Stalker portal's box logged in for as long as its source is the active one. */
export function useStalkerKeepAlive(source: Playlist | null, ready: boolean) {
  useEffect(() => {
    if (!ready || !isTauri() || source?.type !== "STALKER") return;
    return startStalkerKeepAlive(source);
  }, [ready, source]);
}
