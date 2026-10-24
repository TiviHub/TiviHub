import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CatalogWrite,
  IndexName,
  Sealed,
  StorageBackend,
  StorageOp,
  StoreName,
  StoreValues,
  StoredPlaylist,
  StoredSecret,
} from "./backend";
import type {
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  LiveCategoryCacheEntry,
  MdblistPopularCacheEntry,
  MdblistRateLimitState,
  Movie,
  OpenSubtitleChoices,
  OpenSubtitleFileCacheEntry,
  OpenSubtitleSearchCacheEntry,
  PlaylistDocument,
  RatingsCacheEntry,
  Series,
} from "../types";

interface EncryptedPayload {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

export const IDB_DATABASE_NAME = "tivihub-web";
const DATABASE_VERSION = 8;
const CATALOG_WRITE_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 10_000;
const CREDENTIAL_KEY_ID = "local-encryption-key";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
  liveCategoryCache: { key: string; value: LiveCategoryCacheEntry; indexes: { byPlaylist: string } };
  mdblistRateLimits: { key: string; value: MdblistRateLimitState };
  subtitleSearch: { key: string; value: OpenSubtitleSearchCacheEntry };
  subtitleFiles: { key: number; value: OpenSubtitleFileCacheEntry };
  subtitleChoices: { key: string; value: OpenSubtitleChoices };
  secrets: { key: string; value: StoredSecret };
  keys: { key: string; value: CryptoKey };
}

// Opened on first use so a migrated install never touches IndexedDB.
let databasePromise: Promise<IDBPDatabase<TiviHubDatabase>> | null = null;

function getDb(): Promise<IDBPDatabase<TiviHubDatabase>> {
  databasePromise ??= openDB<TiviHubDatabase>(IDB_DATABASE_NAME, DATABASE_VERSION, {
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
    if (oldVersion < 7) {
      database.createObjectStore("subtitleChoices", { keyPath: "itemId" });
    }
    if (oldVersion < 8) {
      database.createObjectStore("liveCategoryCache", { keyPath: "key" }).createIndex("byPlaylist", "playlistId");
    }
  },
});;
  return databasePromise;
}

let localKeyPromise: Promise<CryptoKey> | null = null;

async function localEncryptionKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure local storage is unavailable on this device; source credentials cannot be saved.");
  }
  if (!localKeyPromise) {
    localKeyPromise = (async () => {
      const database = await getDb();
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

async function encrypt(text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await localEncryptionKey(),
    encoder.encode(text),
  );
  return { iv, ciphertext } satisfies EncryptedPayload;
}

async function decrypt(sealed: Sealed): Promise<string> {
  const payload = sealed as EncryptedPayload;
  try {
    const cleartext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.iv },
      await localEncryptionKey(),
      payload.ciphertext,
    );
    return decoder.decode(cleartext);
  } catch (error) {
    console.error("Could not decrypt local TiviHub data", error);
    throw new Error("Local encrypted data could not be opened in this TiviHub installation.", { cause: error });
  }
}

// The generic store methods are checked by StoreValues; idb's own typing cannot follow a union of store names.
type LooseDb = {
  get(store: string, key: IDBValidKey): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
  getAllFromIndex(store: string, index: string, value: IDBValidKey): Promise<unknown[]>;
};

async function saveCatalog(catalog: CatalogWrite): Promise<void> {
  const database = await getDb();
  const storedSource = catalog.sourceUpdate;
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

async function deletePlaylist(
  id: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const database = await getDb();
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
    "liveCategoryCache",
  ] as const;
  const transaction = database.transaction(names, "readwrite");
  try {
    const playlistRange = IDBKeyRange.only(id);
    const stores = ["channels", "movies", "series", "episodes", "favorites", "library", "liveCategoryCache"] as const;
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

async function tx(ops: StorageOp[]): Promise<void> {
  if (ops.length === 0) return;
  const database = await getDb();
  const names = [...new Set(ops.map((op) => op.store))] as StoreName[];
  const transaction = database.transaction(names as never, "readwrite");
  try {
    // Requests run in the order they are queued, so only index deletes have to wait for their key lookup.
    const pending: Promise<unknown>[] = [];
    for (const op of ops) {
      const store = transaction.objectStore(op.store as never) as unknown as {
        put(record: unknown): Promise<unknown>;
        delete(key: IDBValidKey): Promise<void>;
        clear(): Promise<void>;
        index(name: string): { getAllKeys(range: IDBKeyRange): Promise<IDBValidKey[]> };
      };
      if (op.op === "put") pending.push(store.put(op.record));
      else if (op.op === "delete") pending.push(store.delete(op.key));
      else if (op.op === "clear") pending.push(store.clear());
      else {
        const keys = await store.index(op.index).getAllKeys(IDBKeyRange.only(op.value));
        for (const key of keys) pending.push(store.delete(key));
      }
    }
    await Promise.all(pending);
    await transaction.done;
  } catch (cause) {
    try {
      transaction.abort();
    } catch (abortError) {
      if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
        console.error("Could not abort the failed storage transaction", abortError);
      }
    }
    await transaction.done.catch(() => undefined);
    throw cause;
  }
}

export const idbBackend: StorageBackend = {
  kind: "idb",
  async get<S extends StoreName>(store: S, key: string | number) {
    return (await ((await getDb()) as unknown as LooseDb).get(store, key)) as StoreValues[S] | undefined;
  },
  async getAll<S extends StoreName>(store: S) {
    return (await ((await getDb()) as unknown as LooseDb).getAll(store)) as StoreValues[S][];
  },
  async getAllByIndex<S extends StoreName>(store: S, index: IndexName, value: string) {
    return (await ((await getDb()) as unknown as LooseDb).getAllFromIndex(store, index, value)) as StoreValues[S][];
  },
  tx,
  encrypt,
  decrypt,
  saveCatalog,
  deletePlaylist,
};

/** False only when IndexedDB can say for certain that this install never created the database. */
export async function idbDatabaseMayExist(): Promise<boolean> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return true;
  return (await indexedDB.databases()).some((database) => database.name === IDB_DATABASE_NAME);
}
