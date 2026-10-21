import { invoke, isTauri } from "@tauri-apps/api/core";
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
import type { StorageBackend, StorageOp, StoredPlaylist, StoredSecret } from "./backend";
import { fromStoredPlaylist, MDBLIST_KEY_ID, OPEN_SUBTITLES_KEY_ID, toStoredPlaylist } from "./codec";
import { idbBackend } from "./idbBackend";
import { migrateToSqlite } from "./migration";
import { createSqliteBackend } from "./sqliteBackend";



const MIGRATED_HINT_KEY = "tivihub.storage.sqlite";

function migratedHint(): boolean {
  try {
    return window.localStorage.getItem(MIGRATED_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

async function selectBackend(): Promise<StorageBackend> {
  if (!isTauri()) return idbBackend;
  const sqlite = createSqliteBackend(invoke);
  try {
    await sqlite.status();
  } catch (cause) {
    // Once migrated, IndexedDB is a stale copy: using it would show old data and lose new writes.
    if (migratedHint()) {
      throw new Error("TiviHub's local database could not be opened. Restart TiviHub to try again.", { cause });
    }
    console.error("SQLite storage is unavailable; using IndexedDB", cause);
    return idbBackend;
  }
  try {
    if (await migrateToSqlite(idbBackend, sqlite)) {
      try {
        window.localStorage.setItem(MIGRATED_HINT_KEY, "1");
      } catch {
        // The hint only strengthens the stale-copy guard above.
      }
      return sqlite;
    }
  } catch (cause) {
    console.error("Could not migrate local data to SQLite; using IndexedDB", cause);
  }
  return idbBackend;
}

let backendPromise: Promise<StorageBackend> | null = null;

/** Every storage call waits here, so nothing reads or writes until any migration is finished. */
function backend(): Promise<StorageBackend> {
  backendPromise ??= selectBackend().catch((error: unknown) => {
    backendPromise = null;
    throw error;
  });
  return backendPromise;
}

export async function getPlaylists(): Promise<Playlist[]> {
  const b = await backend();
  const stored = await b.getAll("playlists");
  const playlists = await Promise.all(stored.map((record) => fromStoredPlaylist(b, record)));
  const legacy = stored.flatMap((record, index) =>
    !record.privateData && (Object.hasOwn(record, "url") || Object.hasOwn(record, "credentials"))
      ? [toStoredPlaylist(b, playlists[index])]
      : [],
  );
  if (legacy.length > 0) {
    const upgraded = await Promise.all(legacy);
    await b.tx(upgraded.map((record): StorageOp => ({ op: "put", store: "playlists", record })));
  }
  return playlists;
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const b = await backend();
  await b.tx([{ op: "put", store: "playlists", record: await toStoredPlaylist(b, playlist) }]);
}

export async function setActivePlaylist(id: string): Promise<void> {
  const b = await backend();
  const playlists = await b.getAll("playlists");
  await b.tx(playlists.map((playlist): StorageOp => ({
    op: "put",
    store: "playlists",
    record: { ...playlist, active: playlist.id === id },
  })));
}

export async function deletePlaylist(
  id: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  await (await backend()).deletePlaylist(id, onProgress);
}

export async function savePlaylistDocument(document: PlaylistDocument): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "documents", record: document }]);
}

export async function deletePlaylistDocument(playlistId: string): Promise<void> {
  await (await backend()).tx([{ op: "delete", store: "documents", key: playlistId }]);
}

export async function getPlaylistDocument(playlistId: string): Promise<PlaylistDocument | undefined> {
  return (await backend()).get("documents", playlistId);
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
  const b = await backend();
  if (catalog.sourceUpdate && catalog.sourceUpdate.id !== catalog.playlistId) {
    throw new Error("The source metadata does not match the catalog being saved.");
  }
  const { sourceUpdate, ...rest } = catalog;
  await b.saveCatalog({
    ...rest,
    sourceUpdate: sourceUpdate ? await toStoredPlaylist(b, sourceUpdate) : undefined,
  });
}

export async function getCatalogSnapshot(playlistId: string): Promise<{
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
}> {
  const b = await backend();
  const [channels, movies, series, episodes] = await Promise.all([
    b.getAllByIndex("channels", "byPlaylist", playlistId),
    b.getAllByIndex("movies", "byPlaylist", playlistId),
    b.getAllByIndex("series", "byPlaylist", playlistId),
    b.getAllByIndex("episodes", "byPlaylist", playlistId),
  ]);
  return { channels, movies, series, episodes };
}

export async function getChannels(playlistId: string): Promise<LiveChannel[]> {
  return (await backend()).getAllByIndex("channels", "byPlaylist", playlistId);
}

export async function getMovies(playlistId: string): Promise<Movie[]> {
  return (await backend()).getAllByIndex("movies", "byPlaylist", playlistId);
}

export async function getSeries(playlistId: string): Promise<Series[]> {
  return (await backend()).getAllByIndex("series", "byPlaylist", playlistId);
}

export async function saveEpisodes(
  playlistId: string,
  seriesId: string,
  episodes: Episode[],
): Promise<void> {
  const b = await backend();
  const existing = await b.getAllByIndex("episodes", "bySeries", seriesId);
  await b.tx([
    ...existing
      .filter((episode) => episode.playlistId === playlistId)
      .map((episode): StorageOp => ({ op: "delete", store: "episodes", key: episode.id })),
    ...episodes
      .filter((episode) => episode.playlistId === playlistId)
      .map((record): StorageOp => ({ op: "put", store: "episodes", record })),
  ]);
}

export async function getEpisodes(playlistId: string, seriesId: string): Promise<Episode[]> {
  return (await backend()).getAllByIndex("episodes", "bySeries", seriesId)
    .then((episodes) => episodes.filter((episode) => episode.playlistId === playlistId));
}

export async function getFavorites(): Promise<Favorite[]> {
  return (await backend()).getAll("favorites");
}

export async function toggleFavorite(favorite: Favorite): Promise<boolean> {
  const b = await backend();
  if (await b.get("favorites", favorite.id)) {
    await b.tx([{ op: "delete", store: "favorites", key: favorite.id }]);
    return false;
  }
  await b.tx([{ op: "put", store: "favorites", record: favorite }]);
  return true;
}

export async function saveLibraryItem(item: LibraryItem): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "library", record: item }]);
}

export async function removeLibraryItem(id: string): Promise<void> {
  await (await backend()).tx([{ op: "delete", store: "library", key: id }]);
}

export async function getLibraryItems(): Promise<LibraryItem[]> {
  return (await backend()).getAll("library");
}

export async function replaceEpg(playlistId: string, programs: EpgProgram[]): Promise<void> {
  await (await backend()).tx([
    { op: "deleteByIndex", store: "epg", index: "bySource", value: playlistId },
    ...programs.map((record): StorageOp => ({ op: "put", store: "epg", record })),
  ]);
}

export async function replaceEpgForChannels(
  playlistId: string,
  channelIds: string[],
  programs: EpgProgram[],
): Promise<void> {
  const b = await backend();
  const targetIds = new Set(channelIds);
  const existing = await b.getAllByIndex("epg", "bySource", playlistId);
  await b.tx([
    ...existing
      .filter((program) => targetIds.has(program.channelId))
      .map((program): StorageOp => ({ op: "delete", store: "epg", key: program.id })),
    ...programs
      .filter((program) => program.source === playlistId && targetIds.has(program.channelId))
      .map((record): StorageOp => ({ op: "put", store: "epg", record })),
  ]);
}

export async function getEpgPrograms(): Promise<EpgProgram[]> {
  return (await backend()).getAll("epg");
}

async function saveSecret(id: string, value: string): Promise<void> {
  const b = await backend();
  if (!value.trim()) {
    await b.tx([{ op: "delete", store: "secrets", key: id }]);
    return;
  }
  const record: StoredSecret = { id, payload: await b.encrypt(value.trim()) };
  await b.tx([{ op: "put", store: "secrets", record }]);
}

async function getSecret(id: string): Promise<string> {
  const b = await backend();
  const secret = await b.get("secrets", id);
  return secret ? b.decrypt(secret.payload) : "";
}

export const saveOpenSubtitlesApiKey = (apiKey: string) => saveSecret(OPEN_SUBTITLES_KEY_ID, apiKey);
export const getOpenSubtitlesApiKey = () => getSecret(OPEN_SUBTITLES_KEY_ID);
export const saveMdblistApiKey = (apiKey: string) => saveSecret(MDBLIST_KEY_ID, apiKey);
export const getMdblistApiKey = () => getSecret(MDBLIST_KEY_ID);

export async function getRatingsCacheEntry(key: string): Promise<RatingsCacheEntry | undefined> {
  return (await backend()).get("ratings", key);
}

export async function saveRatingsCacheEntry(entry: RatingsCacheEntry): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "ratings", record: entry }]);
}

export async function clearRatingsCache(): Promise<void> {
  await (await backend()).tx([{ op: "clear", store: "ratings" }]);
}

export async function getMdblistPopularCacheEntry(key: string): Promise<MdblistPopularCacheEntry | undefined> {
  return (await backend()).get("popularCatalog", key);
}

export async function saveMdblistPopularCacheEntry(entry: MdblistPopularCacheEntry): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "popularCatalog", record: entry }]);
}

export async function getMdblistRateLimitState(key: string): Promise<MdblistRateLimitState | undefined> {
  return (await backend()).get("mdblistRateLimits", key);
}

export async function saveMdblistRateLimitState(state: MdblistRateLimitState): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "mdblistRateLimits", record: state }]);
}

export async function getOpenSubtitleSearchCacheEntry(key: string): Promise<OpenSubtitleSearchCacheEntry | undefined> {
  return (await backend()).get("subtitleSearch", key);
}

export async function saveOpenSubtitleSearchCacheEntry(entry: OpenSubtitleSearchCacheEntry): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "subtitleSearch", record: entry }]);
}

export async function getOpenSubtitleFileCacheEntry(fileId: number): Promise<OpenSubtitleFileCacheEntry | undefined> {
  return (await backend()).get("subtitleFiles", fileId);
}

export async function saveOpenSubtitleFileCacheEntry(entry: OpenSubtitleFileCacheEntry): Promise<void> {
  await (await backend()).tx([{ op: "put", store: "subtitleFiles", record: entry }]);
}

export async function createSnapshot(
  theme: UserDataSnapshot["theme"],
  showAdultContent = false,
): Promise<UserDataSnapshot> {
  const b = await backend();
  const [storedPlaylists, documents, channels, movies, series, episodes, favorites, library, epg] =
    await Promise.all([
      b.getAll("playlists"),
      b.getAll("documents"),
      b.getAll("channels"),
      b.getAll("movies"),
      b.getAll("series"),
      b.getAll("episodes"),
      b.getAll("favorites"),
      b.getAll("library"),
      b.getAll("epg"),
    ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    playlists: await Promise.all(storedPlaylists.map((record) => fromStoredPlaylist(b, record))),
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
  const b = await backend();
  const storedPlaylists: StoredPlaylist[] = await Promise.all(
    snapshot.playlists.map((playlist) => toStoredPlaylist(b, playlist)),
  );
  const openSubtitlesKey = snapshot.openSubtitlesApiKey.trim();
  const puts = (store: StorageOp["store"], records: readonly unknown[]) =>
    records.map((record): StorageOp => ({ op: "put", store, record: record as never }));
  await b.tx([
    ...(["playlists", "documents", "channels", "movies", "series", "episodes", "favorites", "library", "epg", "secrets"] as const)
      .map((store): StorageOp => ({ op: "clear", store })),
    ...puts("playlists", storedPlaylists),
    ...puts("documents", snapshot.documents),
    ...puts("channels", snapshot.channels),
    ...puts("movies", snapshot.movies),
    ...puts("series", snapshot.series),
    ...puts("episodes", snapshot.episodes),
    ...puts("favorites", snapshot.favorites),
    ...puts("library", snapshot.library),
    ...puts("epg", snapshot.epg),
    ...(openSubtitlesKey
      ? puts("secrets", [{ id: OPEN_SUBTITLES_KEY_ID, payload: await b.encrypt(openSubtitlesKey) }])
      : []),
  ]);
}

export async function cachedCatalogExists(playlistId: string): Promise<boolean> {
  const [channels, movies, series] = await Promise.all([
    getChannels(playlistId),
    getMovies(playlistId),
    getSeries(playlistId),
  ]);
  return channels.length + movies.length + series.length > 0;
}
