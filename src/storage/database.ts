import { openDB, type DBSchema } from "idb";
import type {
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  Movie,
  Playlist,
  PlaylistDocument,
  Series,
  UserDataSnapshot,
} from "../types";

interface EncryptedPayload {
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

type StoredPlaylist = Omit<Playlist, "url" | "username" | "password"> & {
  privateData?: EncryptedPayload;
  url?: string;
  credentials?: EncryptedPayload;
};

interface StoredSecret {
  id: string;
  payload: EncryptedPayload;
}

interface TiviHubDatabase extends DBSchema {
  playlists: { key: string; value: StoredPlaylist };
  documents: { key: string; value: PlaylistDocument };
  channels: {
    key: string;
    value: LiveChannel;
    indexes: { byPlaylist: string };
  };
  movies: {
    key: string;
    value: Movie;
    indexes: { byPlaylist: string };
  };
  series: {
    key: string;
    value: Series;
    indexes: { byPlaylist: string };
  };
  episodes: {
    key: string;
    value: Episode;
    indexes: { byPlaylist: string; bySeries: string };
  };
  favorites: {
    key: string;
    value: Favorite;
    indexes: { byPlaylist: string };
  };
  library: {
    key: string;
    value: LibraryItem;
    indexes: { byPlaylist: string };
  };
  epg: {
    key: string;
    value: EpgProgram;
    indexes: { byChannel: string };
  };
  secrets: { key: string; value: StoredSecret };
  keys: { key: string; value: CryptoKey };
}

const DATABASE_NAME = "tivihub-web";
const DATABASE_VERSION = 1;
const CREDENTIAL_KEY_ID = "local-encryption-key";
const OPEN_SUBTITLES_KEY_ID = "open-subtitles-api-key";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const databasePromise = openDB<TiviHubDatabase>(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(database) {
    database.createObjectStore("playlists", { keyPath: "id" });
    database.createObjectStore("documents", { keyPath: "playlistId" });

    for (const name of ["channels", "movies", "series", "favorites", "library"] as const) {
      database.createObjectStore(name, { keyPath: "id" }).createIndex("byPlaylist", "playlistId");
    }

    const episodes = database.createObjectStore("episodes", { keyPath: "id" });
    episodes.createIndex("byPlaylist", "playlistId");
    episodes.createIndex("bySeries", "seriesId");
    database.createObjectStore("epg", { keyPath: "id" }).createIndex("byChannel", "channelId");
    database.createObjectStore("secrets", { keyPath: "id" });
    database.createObjectStore("keys");
  },
});

let localKeyPromise: Promise<CryptoKey> | null = null;

async function localEncryptionKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure browser storage is unavailable. Open TiviHub over HTTPS to save credentials.");
  }
  if (!localKeyPromise) {
    localKeyPromise = (async () => {
      const database = await databasePromise;
      const existing = await database.get("keys", CREDENTIAL_KEY_ID);
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await database.put("keys", key, CREDENTIAL_KEY_ID);
      return key;
    })().catch((error: unknown) => {
      localKeyPromise = null;
      throw error;
    });
  }
  return localKeyPromise;
}

async function encryptText(value: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await localEncryptionKey(),
    encoder.encode(value),
  );
  return { iv, ciphertext };
}

async function decryptText(payload: EncryptedPayload): Promise<string> {
  try {
    const cleartext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.iv },
      await localEncryptionKey(),
      payload.ciphertext,
    );
    return decoder.decode(cleartext);
  } catch (error) {
    console.error("Could not decrypt local TiviHub data", error);
    throw new Error("Local encrypted data could not be opened in this browser.");
  }
}

async function toStoredPlaylist(playlist: Playlist): Promise<StoredPlaylist> {
  const { url, username, password, ...metadata } = playlist;
  const privateData = url || username || password
    ? await encryptText(JSON.stringify({ url, username, password }))
    : undefined;
  return { ...metadata, privateData };
}

async function fromStoredPlaylist(playlist: StoredPlaylist): Promise<Playlist> {
  if (playlist.privateData) {
    const privateData = JSON.parse(await decryptText(playlist.privateData)) as {
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
    ? JSON.parse(await decryptText(playlist.credentials)) as { username: string; password: string }
    : { username: "", password: "" };
  return {
    ...playlist,
    url: playlist.url ?? "",
    username: credentials.username,
    password: credentials.password,
  };
}

export async function getPlaylists(): Promise<Playlist[]> {
  const database = await databasePromise;
  const stored = await database.getAll("playlists");
  const playlists = await Promise.all(stored.map(fromStoredPlaylist));
  const legacy = stored.flatMap((record, index) =>
    !record.privateData && (Object.hasOwn(record, "url") || Object.hasOwn(record, "credentials"))
      ? [toStoredPlaylist(playlists[index])]
      : [],
  );
  if (legacy.length > 0) {
    await Promise.all(legacy.map(async (record) => database.put("playlists", await record)));
  }
  return playlists;
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const database = await databasePromise;
  await database.put("playlists", await toStoredPlaylist(playlist));
}

export async function setActivePlaylist(id: string): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("playlists", "readwrite");
  const playlists = await transaction.store.getAll();
  await Promise.all(playlists.map((playlist) =>
    transaction.store.put({ ...playlist, active: playlist.id === id }),
  ));
  await transaction.done;
}

export async function deletePlaylist(id: string): Promise<void> {
  const database = await databasePromise;
  const names = [
    "playlists",
    "documents",
    "channels",
    "movies",
    "series",
    "episodes",
    "favorites",
    "library",
    "epg",
  ] as const;
  const transaction = database.transaction(names, "readwrite");
  transaction.objectStore("playlists").delete(id);
  transaction.objectStore("documents").delete(id);
  const cleanup: Promise<void>[] = [];
  for (const name of ["channels", "movies", "series", "episodes", "favorites", "library"] as const) {
    const store = transaction.objectStore(name);
    cleanup.push((async () => {
      const keys = await store.index("byPlaylist").getAllKeys(IDBKeyRange.only(id));
      await Promise.all(keys.map((key) => store.delete(key)));
    })());
  }
  cleanup.push((async () => {
    const store = transaction.objectStore("epg");
    const programs = await store.getAll();
    await Promise.all(programs.filter((program) => program.source === id)
      .map((program) => store.delete(program.id)));
  })());
  await Promise.all(cleanup);
  await transaction.done;
}

export async function savePlaylistDocument(document: PlaylistDocument): Promise<void> {
  const database = await databasePromise;
  await database.put("documents", document);
}

export async function deletePlaylistDocument(playlistId: string): Promise<void> {
  const database = await databasePromise;
  await database.delete("documents", playlistId);
}

export async function getPlaylistDocument(playlistId: string): Promise<PlaylistDocument | undefined> {
  const database = await databasePromise;
  return database.get("documents", playlistId);
}

export async function saveCatalog(catalog: {
  playlistId: string;
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
}): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction(["channels", "movies", "series", "episodes"], "readwrite");
  const replace = async <K extends "channels" | "movies" | "series">(
    name: K,
    records: TiviHubDatabase[K]["value"][],
  ) => {
    const store = transaction.objectStore(name);
    const keys = await store.index("byPlaylist").getAllKeys(IDBKeyRange.only(catalog.playlistId));
    await Promise.all([
      ...keys.map((key) => store.delete(key)),
      ...records.map((record) => store.put(record)),
    ]);
  };
  await Promise.all([
    replace("channels", catalog.channels),
    replace("movies", catalog.movies),
    replace("series", catalog.series),
    (async () => {
      const store = transaction.objectStore("episodes");
      const keys = await store.index("byPlaylist").getAllKeys(IDBKeyRange.only(catalog.playlistId));
      await Promise.all(keys.map((key) => store.delete(key)));
    })(),
  ]);
  await transaction.done;
}

export async function getChannels(playlistId: string): Promise<LiveChannel[]> {
  const database = await databasePromise;
  return database.getAllFromIndex("channels", "byPlaylist", playlistId);
}

export async function getMovies(playlistId: string): Promise<Movie[]> {
  const database = await databasePromise;
  return database.getAllFromIndex("movies", "byPlaylist", playlistId);
}

export async function getSeries(playlistId: string): Promise<Series[]> {
  const database = await databasePromise;
  return database.getAllFromIndex("series", "byPlaylist", playlistId);
}

export async function saveEpisodes(
  playlistId: string,
  seriesId: string,
  episodes: Episode[],
): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("episodes", "readwrite");
  const store = transaction.store;
  const keys = await store.index("bySeries").getAllKeys(IDBKeyRange.only(seriesId));
  const existing = await Promise.all(keys.map((key) => store.get(key)));
  await Promise.all([
    ...keys.flatMap((key, index) =>
      existing[index]?.playlistId === playlistId ? [store.delete(key)] : [],
    ),
    ...episodes.filter((episode) => episode.playlistId === playlistId).map((episode) => store.put(episode)),
  ]);
  await transaction.done;
}

export async function getEpisodes(playlistId: string, seriesId: string): Promise<Episode[]> {
  const database = await databasePromise;
  return database.getAllFromIndex("episodes", "bySeries", seriesId)
    .then((episodes) => episodes.filter((episode) => episode.playlistId === playlistId));
}

export async function getFavorites(): Promise<Favorite[]> {
  const database = await databasePromise;
  return database.getAll("favorites");
}

export async function toggleFavorite(favorite: Favorite): Promise<boolean> {
  const database = await databasePromise;
  const existing = await database.get("favorites", favorite.id);
  if (existing) {
    await database.delete("favorites", favorite.id);
    return false;
  }
  await database.put("favorites", favorite);
  return true;
}

export async function saveLibraryItem(item: LibraryItem): Promise<void> {
  const database = await databasePromise;
  await database.put("library", item);
}

export async function removeLibraryItem(id: string): Promise<void> {
  const database = await databasePromise;
  await database.delete("library", id);
}

export async function getLibraryItems(): Promise<LibraryItem[]> {
  const database = await databasePromise;
  return database.getAll("library");
}

export async function replaceEpg(playlistId: string, programs: EpgProgram[]): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("epg", "readwrite");
  const store = transaction.store;
  const existing = await store.getAll();
  await Promise.all([
    ...existing.filter((program) => program.source === playlistId)
      .map((program) => store.delete(program.id)),
    ...programs.map((program) => store.put(program)),
  ]);
  await transaction.done;
}

export async function replaceEpgForChannels(
  playlistId: string,
  channelIds: string[],
  programs: EpgProgram[],
): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("epg", "readwrite");
  const store = transaction.store;
  const targetIds = new Set(channelIds);
  const existing = await store.getAll();
  await Promise.all([
    ...existing
      .filter((program) => program.source === playlistId && targetIds.has(program.channelId))
      .map((program) => store.delete(program.id)),
    ...programs
      .filter((program) => program.source === playlistId && targetIds.has(program.channelId))
      .map((program) => store.put(program)),
  ]);
  await transaction.done;
}

export async function getEpgPrograms(): Promise<EpgProgram[]> {
  const database = await databasePromise;
  return database.getAll("epg");
}

export async function saveOpenSubtitlesApiKey(apiKey: string): Promise<void> {
  const database = await databasePromise;
  if (!apiKey.trim()) {
    await database.delete("secrets", OPEN_SUBTITLES_KEY_ID);
    return;
  }
  await database.put("secrets", {
    id: OPEN_SUBTITLES_KEY_ID,
    payload: await encryptText(apiKey.trim()),
  });
}

export async function getOpenSubtitlesApiKey(): Promise<string> {
  const database = await databasePromise;
  const secret = await database.get("secrets", OPEN_SUBTITLES_KEY_ID);
  return secret ? decryptText(secret.payload) : "";
}

export async function createSnapshot(
  theme: UserDataSnapshot["theme"],
): Promise<UserDataSnapshot> {
  const database = await databasePromise;
  const [storedPlaylists, documents, channels, movies, series, episodes, favorites, library, epg] =
    await Promise.all([
      database.getAll("playlists"),
      database.getAll("documents"),
      database.getAll("channels"),
      database.getAll("movies"),
      database.getAll("series"),
      database.getAll("episodes"),
      database.getAll("favorites"),
      database.getAll("library"),
      database.getAll("epg"),
    ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    playlists: await Promise.all(storedPlaylists.map(fromStoredPlaylist)),
    documents,
    channels,
    movies,
    series,
    episodes,
    favorites,
    library,
    epg,
    openSubtitlesApiKey: await getOpenSubtitlesApiKey(),
    theme,
  };
}

export async function restoreSnapshot(snapshot: UserDataSnapshot): Promise<void> {
  const database = await databasePromise;
  const storedPlaylists = await Promise.all(snapshot.playlists.map(toStoredPlaylist));
  const openSubtitlesSecret = snapshot.openSubtitlesApiKey.trim()
    ? {
        id: OPEN_SUBTITLES_KEY_ID,
        payload: await encryptText(snapshot.openSubtitlesApiKey.trim()),
      }
    : undefined;
  const names = [
    "playlists",
    "documents",
    "channels",
    "movies",
    "series",
    "episodes",
    "favorites",
    "library",
    "epg",
    "secrets",
  ] as const;
  const transaction = database.transaction(names, "readwrite");
  for (const name of names) transaction.objectStore(name).clear();
  await Promise.all([
    ...storedPlaylists.map((record) => transaction.objectStore("playlists").put(record)),
    ...snapshot.documents.map((record) => transaction.objectStore("documents").put(record)),
    ...snapshot.channels.map((record) => transaction.objectStore("channels").put(record)),
    ...snapshot.movies.map((record) => transaction.objectStore("movies").put(record)),
    ...snapshot.series.map((record) => transaction.objectStore("series").put(record)),
    ...snapshot.episodes.map((record) => transaction.objectStore("episodes").put(record)),
    ...snapshot.favorites.map((record) => transaction.objectStore("favorites").put(record)),
    ...snapshot.library.map((record) => transaction.objectStore("library").put(record)),
    ...snapshot.epg.map((record) => transaction.objectStore("epg").put(record)),
    ...(openSubtitlesSecret
      ? [transaction.objectStore("secrets").put(openSubtitlesSecret)]
      : []),
  ]);
  await transaction.done;
}

export async function cachedCatalogExists(playlistId: string): Promise<boolean> {
  const [channels, movies, series] = await Promise.all([
    getChannels(playlistId),
    getMovies(playlistId),
    getSeries(playlistId),
  ]);
  return channels.length + movies.length + series.length > 0;
}
