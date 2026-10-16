import demoPlaylistContent from "./fixtures/demo.m3u?raw";
import type { Playlist } from "./types";

export const DEMO_PLAYLIST_ID = "tivihub-demo";
export const DEMO_PLAYLIST_CONTENT = demoPlaylistContent;

export function createDemoPlaylist(active: boolean): Playlist {
  return {
    id: DEMO_PLAYLIST_ID,
    name: "TiviHub Demo Library",
    type: "M3U",
    url: "",
    username: "",
    password: "",
    active,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    fileName: "demo.m3u",
    demo: true,
    createdAt: Date.now(),
  };
}
