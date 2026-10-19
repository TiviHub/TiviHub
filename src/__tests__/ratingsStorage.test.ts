import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { openDB } from "idb";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Movie, RatingsCacheEntry } from "../types";

const entry = (key: string): RatingsCacheEntry => ({
  key,
  mediaType: "MOVIE",
  title: "Heat",
  ratings: { ratings: [{ source: "imdb", value: 8.3 }] },
  fetchedAt: 1,
  expiresAt: 2,
});

describe("ratings cache storage", () => {
  beforeAll(() => {
    vi.stubGlobal("crypto", webcrypto);
  });

  it("migrates a version 2 database without losing existing data", async () => {
    const legacy = await openDB("tivihub-web", 2, {
      upgrade(database, _old, _new, transaction) {
        database.createObjectStore("playlists", { keyPath: "id" });
        database.createObjectStore("documents", { keyPath: "playlistId" });
        for (const name of ["channels", "movies", "series", "favorites", "library"]) {
          database.createObjectStore(name, { keyPath: "id" }).createIndex("byPlaylist", "playlistId");
        }
        const episodes = database.createObjectStore("episodes", { keyPath: "id" });
        episodes.createIndex("byPlaylist", "playlistId");
        episodes.createIndex("bySeries", "seriesId");
        const epg = database.createObjectStore("epg", { keyPath: "id" });
        epg.createIndex("byChannel", "channelId");
        epg.createIndex("bySource", "source");
        database.createObjectStore("secrets", { keyPath: "id" });
        database.createObjectStore("keys");
        void transaction;
      },
    });
    const movie: Movie = {
      id: "old:movie:1", playlistId: "old", name: "Legacy", streamUrl: "https://p.example/1.mp4", rating: 7.5,
    };
    await legacy.put("movies", movie);
    await legacy.put("favorites", { id: "f1", contentId: movie.id, contentType: "MOVIE", title: "Legacy", playlistId: "old", addedAt: 1 });
    legacy.close();

    const storage = await import("../storage/database");
    await expect(storage.getMovies("old")).resolves.toEqual([movie]);
    await expect(storage.getFavorites()).resolves.toHaveLength(1);
    await expect(storage.getRatingsCacheEntry("movie:imdb:tt1")).resolves.toBeUndefined();
  });

  it("persists ratings independent of playlists and clears them", async () => {
    const storage = await import("../storage/database");
    await storage.saveRatingsCacheEntry(entry("movie:imdb:tt0113277"));
    await storage.saveRatingsCacheEntry({ ...entry("series:imdb:tt0113277"), mediaType: "SERIES" });
    expect(await storage.getRatingsCacheEntry("movie:imdb:tt0113277")).toEqual(entry("movie:imdb:tt0113277"));
    expect((await storage.getRatingsCacheEntry("series:imdb:tt0113277"))?.mediaType).toBe("SERIES");
    await storage.clearRatingsCache();
    expect(await storage.getRatingsCacheEntry("movie:imdb:tt0113277")).toBeUndefined();
  });

  it("encrypts the MDBList key and keeps it out of backups", async () => {
    const storage = await import("../storage/database");
    await storage.saveMdblistApiKey(" secret-key ");
    expect(await storage.getMdblistApiKey()).toBe("secret-key");
    const snapshot = await storage.createSnapshot("dark");
    expect(JSON.stringify(snapshot)).not.toContain("secret-key");
    await storage.saveMdblistApiKey("");
    expect(await storage.getMdblistApiKey()).toBe("");
  });
});
