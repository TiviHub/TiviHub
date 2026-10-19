import { openDB, type DBSchema } from "idb";
import type {
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  MdblistPopularCacheEntry,
  MdblistRateLimitState,
  Movie,
  OpenSubtitleFileCacheEntry,
  OpenSubtitleSearchCacheEntry,
  Playlist,
  PlaylistDocument,
  RatingsCacheEntry,
  Series,
  UserDataSnapshot,
} from "../types";

interface EncryptedPayload {
  iv: Uint8Array<ArrayBuffer>;
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
    indexes: { byChannel: string; bySource: string };
  };
  ratings: { key: string; value: RatingsCacheEntry };
  popularCatalog: { key: string; value: MdblistPopularCacheEntry };
  mdblistRateLimits: { key: string; value: MdblistRateLimitState };
  subtitleSearch: { key: string; value: OpenSubtitleSearchCacheEntry };
  subtitleFiles: { key: number; value: OpenSubtitleFileCacheEntry };
  secrets: { key: string; value: StoredSecret };
  keys: { key: string; value: CryptoKey };
}

const DATABASE_NAME = "tivihub-web";
const DATABASE_VERSION = 6;
const CATALOG_WRITE_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 10_000;
const CREDENTIAL_KEY_ID = "local-encryption-key";
const OPEN_SUBTITLES_KEY_ID = "open-subtitles-api-key";
const MDBLIST_KEY_ID = "mdblist-api-key";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const databasePromise = openDB<TiviHubDatabase>(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(database, oldVersion, _newVersion, transaction) {
    if (oldVersion < 1) {
      database.createObjectStore("playlists", { keyPath: "id" });
      database.createObjectStore("documents", { keyPath: "playlistId" });

      for (const name of ["channels", "movies", "series", "favorites", "library"] as const) {
        database.createObjectStore(name, { keyPath: "id" }).createIndex("byPlaylist", "playlistId");
      }

      const episodes = database.createObjectStore("episodes", { keyPath: "id" });
      episodes.createIndex("byPlaylist", "playlistId");
      episodes.createIndex("bySeries", "seriesId");
      const epg = database.createObjectStore("epg", { keyPath: "id" });
      epg.createIndex("byChannel", "channelId");
      database.createObjectStore("secrets", { keyPath: "id" });
      database.createObjectStore("keys");
    }
    if (oldVersion < 2) {
      transaction.objectStore("epg").createIndex("bySource", "source");
    }
    if (oldVersion < 3) {
      database.createObjectStore("ratings", { keyPath: "key" });
    }
    if (oldVersion < 4) {
      database.createObjectStore("popularCatalog", { keyPath: "key" });
    }
    if (oldVersion < 5) {
      database.createObjectStore("mdblistRateLimits", { keyPath: "key" });
    }
    if (oldVersion < 6) {
      database.createObjectStore("subtitleSearch", { keyPath: "key" });
      database.createObjectStore("subtitleFiles", { keyPath: "fileId" });
    }
  },
});

let localKeyPromise: Promise<CryptoKey> | null = null;

async function localEncryptionKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure local storage is unavailable on this device; source credentials cannot be saved.");
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
    throw new Error("Local encrypted data could not be opened in this TiviHub installation.");
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

export async function deletePlaylist(
  id: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
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
  try {
    const playlistRange = IDBKeyRange.only(id);
    const stores = ["channels", "movies", "series", "episodes", "favorites", "library"] as const;
    const counts = await Promise.all([
      transaction.objectStore("playlists").count(id),
      transaction.objectStore("documents").count(id),
      ...stores.map((name) => transaction.objectStore(name).index("byPlaylist").count(playlistRange)),
      transaction.objectStore("epg").index("bySource").count(playlistRange),
    ]);
    const total = counts.reduce((sum, count) => sum + count, 0);
    let completed = 0;
    const deleteKeys = async (
      deleteRecord: (key: string) => Promise<unknown>,
      keys: string[],
    ) => {
      for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
        const end = Math.min(start + DELETE_BATCH_SIZE, keys.length);
        await Promise.all(keys.slice(start, end).map(deleteRecord));
        completed += end - start;
        onProgress?.(completed, total);
      }
    };
    for (const name of stores) {
      const store = transaction.objectStore(name);
      const keys = await store.index("byPlaylist").getAllKeys(playlistRange);
      await deleteKeys((key) => store.delete(key), keys);
    }
    const epgStore = transaction.objectStore("epg");
    await deleteKeys(
      (key) => epgStore.delete(key),
      await epgStore.index("bySource").getAllKeys(playlistRange),
    );
    await transaction.objectStore("documents").delete(id);
    if (counts[1] > 0) {
      completed += 1;
      onProgress?.(completed, total);
    }
    await transaction.objectStore("playlists").delete(id);
    if (counts[0] > 0) {
      completed += 1;
      onProgress?.(completed, total);
    }
    await transaction.done;
    if (total === 0) onProgress?.(0, 0);
  } catch (cause) {
    try {
      transaction.abort();
    } catch (abortError) {
      if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
        console.error("Could not abort the failed playlist deletion transaction", abortError);
      }
    }
    await transaction.done.catch(() => undefined);
    throw cause;
  }
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
  episodes?: Episode[];
  sourceUpdate?: Playlist;
  onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
  const database = await databasePromise;
  if (catalog.sourceUpdate && catalog.sourceUpdate.id !== catalog.playlistId) {
    throw new Error("The source metadata does not match the catalog being saved.");
  }
  const storedSource = catalog.sourceUpdate
    ? await toStoredPlaylist(catalog.sourceUpdate)
    : undefined;
  const transaction = database.transaction(["channels", "movies", "series", "episodes", "playlists"], "readwrite");
  try {
    if (storedSource && !(await transaction.objectStore("playlists").get(catalog.playlistId))) {
      throw new Error("This source was deleted before its refreshed catalog could be saved.");
    }
    const getKeys = async (name: "channels" | "movies" | "series" | "episodes"): Promise<string[]> => {
      const keys = await transaction.objectStore(name).index("byPlaylist")
        .getAllKeys(IDBKeyRange.only(catalog.playlistId));
      if (!keys.every((key): key is string => typeof key === "string")) {
        throw new Error("The local catalog contains a record with an invalid key.");
      }
      return keys;
    };
    const [channelKeys, movieKeys, seriesKeys, episodeKeys] = await Promise.all([
      getKeys("channels"),
      getKeys("movies"),
      getKeys("series"),
      catalog.episodes === undefined ? Promise.resolve([] as string[]) : getKeys("episodes"),
    ]);
    const keysToDelete = <T extends { id: string }>(keys: string[], records: T[]) => {
      const retainedIds = new Set(records.map((record) => record.id));
      return keys.filter((key) => !retainedIds.has(key));
    };
    const channelKeysToDelete = keysToDelete(channelKeys, catalog.channels);
    const movieKeysToDelete = keysToDelete(movieKeys, catalog.movies);
    const seriesKeysToDelete = keysToDelete(seriesKeys, catalog.series);
    const episodeKeysToDelete = catalog.episodes === undefined
      ? []
      : keysToDelete(episodeKeys, catalog.episodes);
    const total = channelKeysToDelete.length + movieKeysToDelete.length +
      seriesKeysToDelete.length + episodeKeysToDelete.length +
      catalog.channels.length + catalog.movies.length + catalog.series.length + (catalog.episodes?.length ?? 0);
    let completed = 0;
    const processBatches = async <T>(
      values: readonly T[],
      request: (value: T) => Promise<unknown>,
    ) => {
      for (let start = 0; start < values.length; start += CATALOG_WRITE_BATCH_SIZE) {
        const end = Math.min(start + CATALOG_WRITE_BATCH_SIZE, values.length);
        const batch: Promise<unknown>[] = [];
        for (let index = start; index < end; index += 1) batch.push(request(values[index]));
        await Promise.all(batch);
        completed += end - start;
        catalog.onProgress?.(completed, total);
      }
    };
    const replace = async <K extends "channels" | "movies" | "series" | "episodes">(
      name: K,
      keys: string[],
      records: TiviHubDatabase[K]["value"][],
    ) => {
      const store = transaction.objectStore(name);
      await processBatches(keys, (key) => store.delete(key));
      await processBatches(records, (record) => store.put(record));
    };
    const replacements = [
      replace("channels", channelKeysToDelete, catalog.channels),
      replace("movies", movieKeysToDelete, catalog.movies),
      replace("series", seriesKeysToDelete, catalog.series),
    ];
    if (catalog.episodes !== undefined) {
      replacements.push(replace("episodes", episodeKeysToDelete, catalog.episodes));
    }
    if (storedSource) {
      replacements.push((async () => {
        await transaction.objectStore("playlists").put(storedSource);
      })());
    }
    await Promise.all(replacements);
    await transaction.done;
  } catch (cause) {
    try {
      transaction.abort();
    } catch (abortError) {
      if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
        console.error("Could not abort the failed catalog transaction", abortError);
      }
    }
    await transaction.done.catch(() => undefined);
    throw cause;
  }
}

export async function getCatalogSnapshot(playlistId: string): Promise<{
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
}> {
  const database = await databasePromise;
  const [channels, movies, series, episodes] = await Promise.all([
    database.getAllFromIndex("channels", "byPlaylist", playlistId),
    database.getAllFromIndex("movies", "byPlaylist", playlistId),
    database.getAllFromIndex("series", "byPlaylist", playlistId),
    database.getAllFromIndex("episodes", "byPlaylist", playlistId),
  ]);
  return { channels, movies, series, episodes };
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

export async function saveMdblistApiKey(apiKey: string): Promise<void> {
  const database = await databasePromise;
  if (!apiKey.trim()) {
    await database.delete("secrets", MDBLIST_KEY_ID);
    return;
  }
  await database.put("secrets", {
    id: MDBLIST_KEY_ID,
    payload: await encryptText(apiKey.trim()),
  });
}

export async function getMdblistApiKey(): Promise<string> {
  const database = await databasePromise;
  const secret = await database.get("secrets", MDBLIST_KEY_ID);
  return secret ? decryptText(secret.payload) : "";
}

export async function getRatingsCacheEntry(key: string): Promise<RatingsCacheEntry | undefined> {
  const database = await databasePromise;
  return database.get("ratings", key);
}

export async function saveRatingsCacheEntry(entry: RatingsCacheEntry): Promise<void> {
  const database = await databasePromise;
  await database.put("ratings", entry);
}

export async function clearRatingsCache(): Promise<void> {
  const database = await databasePromise;
  await database.clear("ratings");
}

export async function getMdblistPopularCacheEntry(key: string): Promise<MdblistPopularCacheEntry | undefined> {
  const database = await databasePromise;
  return database.get("popularCatalog", key);
}

export async function saveMdblistPopularCacheEntry(entry: MdblistPopularCacheEntry): Promise<void> {
  const database = await databasePromise;
  await database.put("popularCatalog", entry);
}

export async function getMdblistRateLimitState(key: string): Promise<MdblistRateLimitState | undefined> {
  const database = await databasePromise;
  return database.get("mdblistRateLimits", key);
}

export async function saveMdblistRateLimitState(state: MdblistRateLimitState): Promise<void> {
  const database = await databasePromise;
  await database.put("mdblistRateLimits", state);
}

export async function getOpenSubtitleSearchCacheEntry(key: string): Promise<OpenSubtitleSearchCacheEntry | undefined> {
  const database = await databasePromise;
  return database.get("subtitleSearch", key);
}

export async function saveOpenSubtitleSearchCacheEntry(entry: OpenSubtitleSearchCacheEntry): Promise<void> {
  const database = await databasePromise;
  await database.put("subtitleSearch", entry);
}

export async function getOpenSubtitleFileCacheEntry(fileId: number): Promise<OpenSubtitleFileCacheEntry | undefined> {
  const database = await databasePromise;
  return database.get("subtitleFiles", fileId);
}

export async function saveOpenSubtitleFileCacheEntry(entry: OpenSubtitleFileCacheEntry): Promise<void> {
  const database = await databasePromise;
  await database.put("subtitleFiles", entry);
}

export async function createSnapshot(
  theme: UserDataSnapshot["theme"],
  showAdultContent = false,
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
    showAdultContent,
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
