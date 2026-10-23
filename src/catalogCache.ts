import type { Playlist } from "./types";

export const CATALOG_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

type CatalogSource = Pick<
  Playlist,
  "type" | "url" | "fileName" | "demo" | "createdAt" | "lastCatalogRefreshAt" | "expiresAtMillis"
>;

export function isPlaylistExpired(source: Pick<Playlist, "expiresAtMillis">, now = Date.now()): boolean {
  return source.expiresAtMillis !== undefined &&
    Number.isFinite(source.expiresAtMillis) &&
    source.expiresAtMillis <= now;
}

export function canAutoRefreshCatalog(source: CatalogSource): boolean {
  if (source.demo) return false;
  return source.type === "XTREAM" || source.type === "STALKER" || (source.type === "M3U" && !source.fileName && Boolean(source.url));
}

export function catalogRefreshDueAt(source: CatalogSource): number {
  return (source.lastCatalogRefreshAt ?? source.createdAt) + CATALOG_REFRESH_INTERVAL;
}

export function isCatalogRefreshDue(source: CatalogSource, now = Date.now()): boolean {
  return canAutoRefreshCatalog(source) && now >= catalogRefreshDueAt(source);
}
