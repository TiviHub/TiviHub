import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { startRustHarness } from "./rustHarness";
import type { Episode, EpgProgram, Favorite, LiveChannel, Movie, Playlist, Series } from "../types";

type Database = typeof import("../storage/database");

function playlist(id: string, type: Playlist["type"]): Playlist {
  return {
    id,
    name: `Source ${id}`,
    type,
    url: "https://provider.example",
    username: `user-${id}`,
    password: `secret-${id}`,
    active: id === "a",
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: 1,
  };
}

// Three sources with mixed content, guide data, favorites and an API key.
async function populate(db: Database) {
  for (const [id, type] of [["a", "XTREAM"], ["b", "M3U"], ["c", "XTREAM"]] as const) {
    await db.savePlaylist(playlist(id, type));
    const channels: LiveChannel[] = [1, 2, 3].map((n) => ({
      id: `${id}:c${n}`, playlistId: id, name: `Channel ${n}`, group: "News", streamUrl: `https://p.example/${id}/${n}.m3u8`,
    }));
    const movies = [1, 2].map((n) => ({
      id: `${id}:m${n}`, playlistId: id, name: `Movie ${n}`, streamUrl: `https://p.example/${id}/${n}.mp4`,
    })) as Movie[];
    const series: Series[] = [{ id: `${id}:s1`, playlistId: id, name: "Series", seasons: 1 }];
    const episodes: Episode[] = [{
      id: `${id}:e1`, playlistId: id, seriesId: `${id}:s1`, season: 1, number: 1, name: "Pilot", streamUrl: "https://p.example/e.m3u8",
    }];
    await db.saveCatalog({ playlistId: id, channels, movies, series, episodes });
    const guide: EpgProgram = {
      id: `${id}:g1`, source: id, channelId: `${id}:c1`, title: "Guide", startMillis: 1000, endMillis: 2000,
    };
    await db.replaceEpg(id, [guide]);
    const favorite: Favorite = {
      id: `${id}:f1`, contentId: `${id}:c1`, contentType: "LIVE", title: "Fav", playlistId: id, streamUrl: "https://p.example/f.m3u8", addedAt: 5,
    };
    await db.toggleFavorite(favorite);
  }
  await db.saveOpenSubtitlesApiKey("os-key");
  await db.deletePlaylist("c");
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );

// Sealed credential blobs differ per backend by design; the decrypted fields must match.
const normalize = (snapshot: Awaited<ReturnType<Database["createSnapshot"]>>) => {
  snapshot = { ...snapshot, playlists: snapshot.playlists.map(({ privateData: _sealed, ...rest }: Playlist & { privateData?: unknown }) => rest) };
  const sorted = Object.fromEntries(
    Object.entries({ ...snapshot, exportedAt: 0 }).map(([key, value]) =>
      [key, Array.isArray(value) ? [...value].sort((x, y) => canonical(x).localeCompare(canonical(y))) : value],
    ),
  );
  return sorted;
};

it("gives the same snapshot from the IndexedDB and Rust backends for the same operations", async () => {
  const idb = await import("../storage/database");
  await populate(idb);
  const expected = normalize(await idb.createSnapshot("light"));

  globalThis.indexedDB = new IDBFactory();
  const harness = startRustHarness();
  try {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: harness.invoke }));
    const sqlite = await import("../storage/database");
    await populate(sqlite);
    expect(normalize(await sqlite.createSnapshot("light"))).toEqual(expected);
  } finally {
    harness.close();
  }
}, 60_000);
