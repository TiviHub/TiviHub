import type { Playlist } from "../types";
import type { StorageBackend, StoredPlaylist } from "./backend";

export const OPEN_SUBTITLES_KEY_ID = "open-subtitles-api-key";
export const MDBLIST_KEY_ID = "mdblist-api-key";

export async function toStoredPlaylist(backend: StorageBackend, playlist: Playlist): Promise<StoredPlaylist> {
  const { url, username, password, ...metadata } = playlist;
  const privateData = url || username || password
    ? await backend.encrypt(JSON.stringify({ url, username, password }))
    : undefined;
  return { ...metadata, privateData };
}

export async function fromStoredPlaylist(backend: StorageBackend, playlist: StoredPlaylist): Promise<Playlist> {
  if (playlist.privateData) {
    const privateData = JSON.parse(await backend.decrypt(playlist.privateData)) as {
      url: string;
      username: string;
      password: string;
    };
    return {
      ...playlist,
      url: privateData.url,
      username: privateData.username,
      password: privateData.password,
    };
  }
  const credentials = playlist.credentials
    ? JSON.parse(await backend.decrypt(playlist.credentials)) as { username: string; password: string }
    : { username: "", password: "" };
  return {
    ...playlist,
    url: playlist.url ?? "",
    username: credentials.username,
    password: credentials.password,
  };
}
