import type {
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveCategoryCacheEntry,
  LiveChannel,
  MdblistPopularCacheEntry,
  MdblistRateLimitState,
  Movie,
  OpenSubtitleChoices,
  OpenSubtitleFileCacheEntry,
  OpenSubtitleSearchCacheEntry,
  Playlist,
  PlaylistDocument,
  RatingsCacheEntry,
  Reminder,
  Series,
} from "../types";

/** Encrypted text as the backend stores it: an IndexedDB payload object or an opaque string from Rust. */
export type Sealed = unknown;

export type StoredPlaylist = Omit<Playlist, "url" | "username" | "password" | "macAddress"> & {
  privateData?: Sealed;
  url?: string;
  credentials?: Sealed;
};

export interface StoredSecret {
  id: string;
  payload: Sealed;
}

export interface StoreValues {
  playlists: StoredPlaylist;
  documents: PlaylistDocument;
  channels: LiveChannel;
  movies: Movie;
  series: Series;
  episodes: Episode;
  favorites: Favorite;
  library: LibraryItem;
  reminders: Reminder;
  epg: EpgProgram;
  ratings: RatingsCacheEntry;
  popularCatalog: MdblistPopularCacheEntry;
  liveCategoryCache: LiveCategoryCacheEntry;
  mdblistRateLimits: MdblistRateLimitState;
  subtitleSearch: OpenSubtitleSearchCacheEntry;
  subtitleFiles: OpenSubtitleFileCacheEntry;
  subtitleChoices: OpenSubtitleChoices;
  secrets: StoredSecret;
}

export type StoreName = keyof StoreValues;
export type IndexName = "byPlaylist" | "bySeries" | "byChannel" | "bySource";

export const STORE_NAMES: readonly StoreName[] = [
  "playlists", "documents", "channels", "movies", "series", "episodes", "favorites",
  "library", "reminders", "epg", "ratings", "popularCatalog", "liveCategoryCache", "mdblistRateLimits", "subtitleSearch",
  "subtitleFiles", "subtitleChoices", "secrets",
];

/** One backend call that runs as a single transaction together with the rest of its batch. */
export type StorageOp =
  | { op: "put"; store: StoreName; record: StoreValues[StoreName] }
  | { op: "delete"; store: StoreName; key: string }
  | { op: "clear"; store: StoreName }
  | { op: "deleteByIndex"; store: StoreName; index: IndexName; value: string };

export interface CatalogWrite {
  playlistId: string;
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes?: Episode[];
  sourceUpdate?: StoredPlaylist;
  onProgress?: (completed: number, total: number) => void;
}

export interface StorageBackend {
  kind: "idb" | "sqlite";
  get<S extends StoreName>(store: S, key: string | number): Promise<StoreValues[S] | undefined>;
  getAll<S extends StoreName>(store: S): Promise<StoreValues[S][]>;
  getAllByIndex<S extends StoreName>(store: S, index: IndexName, value: string): Promise<StoreValues[S][]>;
  /** All ops commit together or not at all. */
  tx(ops: StorageOp[]): Promise<void>;
  encrypt(text: string): Promise<Sealed>;
  decrypt(sealed: Sealed): Promise<string>;
  saveCatalog(write: CatalogWrite): Promise<void>;
  deletePlaylist(id: string, onProgress?: (completed: number, total: number) => void): Promise<void>;
}
