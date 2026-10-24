import type { LiveChannel, Playlist } from "../types";

export const MAX_MULTIVIEW_TILES = 4;

export type MultiViewSupport = "ok" | "drm" | "portal";

/** Multiview shows plain streams. A DRM stream needs a licence flow per tile, a portal link a fresh address per tile. */
export function multiViewSupport(channel: LiveChannel, source: Pick<Playlist, "type"> | undefined): MultiViewSupport {
  if (channel.drmLicenseUrl) return "drm";
  if (source?.type === "STALKER") return "portal";
  return "ok";
}

export const channelKey = (channel: Pick<LiveChannel, "playlistId" | "id">) => `${channel.playlistId}:${channel.id}`;

export function addChannel(tiles: readonly LiveChannel[], channel: LiveChannel): LiveChannel[] {
  if (tiles.length >= MAX_MULTIVIEW_TILES || tiles.some((tile) => channelKey(tile) === channelKey(channel))) {
    return [...tiles];
  }
  return [...tiles, channel];
}

export function removeChannel(tiles: readonly LiveChannel[], key: string): LiveChannel[] {
  return tiles.filter((tile) => channelKey(tile) !== key);
}

/** Only one tile has sound. When the one with sound goes away, the first remaining tile takes over. */
export function audibleKeyAfter(tiles: readonly LiveChannel[], audible: string | null): string | null {
  if (audible && tiles.some((tile) => channelKey(tile) === audible)) return audible;
  return tiles[0] ? channelKey(tiles[0]) : null;
}

export const multiViewColumns = (count: number): 1 | 2 => (count <= 1 ? 1 : 2);
