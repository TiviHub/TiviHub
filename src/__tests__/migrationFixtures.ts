import type { StoreValues } from "../storage/backend";
import { toStoredPlaylist } from "../storage/codec";
import { idbBackend } from "../storage/idbBackend";
import type { Playlist } from "../types";


export function playlist(id: string): Playlist {
  return {
    id,
    name: id,
    type: "XTREAM",
    url: "https://provider.example",
    username: `user-${id}`,
    password: `pw-${id}`,
    active: false,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: 1,
  };
}

export async function seedIdb(id: string) {
  await idbBackend.tx([
    { op: "put", store: "playlists", record: await toStoredPlaylist(idbBackend, playlist(id)) },
    { op: "put", store: "channels", record: { id: `${id}-c`, playlistId: id, name: "Channel" } as StoreValues["channels"] },
    { op: "put", store: "favorites", record: { id: `${id}-f`, playlistId: id } as unknown as StoreValues["favorites"] },
    { op: "put", store: "subtitleFiles", record: { fileId: 7, name: "a.srt", contents: "x", fetchedAt: 1, expiresAt: 2 } },
    { op: "put", store: "secrets", record: { id: "mdblist-api-key", payload: await idbBackend.encrypt("mdb-secret") } },
    { op: "put", store: "secrets", record: { id: "open-subtitles-api-key", payload: await idbBackend.encrypt("os-secret") } },
  ]);
}
