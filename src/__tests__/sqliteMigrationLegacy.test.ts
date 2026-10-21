import "fake-indexeddb/auto";
import { openDB } from "idb";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { memorySqlite } from "./memorySqlite";

// Mirrors the v1 schema from idbBackend's upgrade(); the real module then upgrades it in place.
async function seedLegacy(version: 1 | 3 | 5) {
  const db = await openDB("tivihub-web", version, {
    upgrade(database) {
      database.createObjectStore("playlists", { keyPath: "id" });
      database.createObjectStore("documents", { keyPath: "playlistId" });
      for (const name of ["channels", "movies", "series", "favorites", "library"]) {
        database.createObjectStore(name, { keyPath: "id" }).createIndex("byPlaylist", "playlistId");
      }
      const episodes = database.createObjectStore("episodes", { keyPath: "id" });
      episodes.createIndex("byPlaylist", "playlistId");
      episodes.createIndex("bySeries", "seriesId");
      database.createObjectStore("epg", { keyPath: "id" }).createIndex("byChannel", "channelId");
      database.createObjectStore("secrets", { keyPath: "id" });
      database.createObjectStore("keys");
      if (version >= 3) database.createObjectStore("ratings", { keyPath: "key" });
      if (version >= 5) {
        database.createObjectStore("popularCatalog", { keyPath: "key" });
        database.createObjectStore("mdblistRateLimits", { keyPath: "key" });
      }
    },
  });
  await db.put("channels", { id: "legacy-c", playlistId: "p", name: "Old channel" });
  await db.put("favorites", { id: "legacy-f", playlistId: "p" });
  db.close();
}

describe.each([1, 3, 5] as const)("migrating an IndexedDB left at schema v%i", (version) => {
  it("upgrades it in place and copies its records", async () => {
    // idbBackend keeps its connection open, so each case gets a fresh IndexedDB and a fresh module.
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
    await seedLegacy(version);
    const { idbBackend } = await import("../storage/idbBackend");
    const { migrateToSqlite } = await import("../storage/migration");
    const sqlite = memorySqlite();

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);

    expect((await sqlite.getAll("channels")).map((c) => c.id)).toEqual(["legacy-c"]);
    expect((await sqlite.getAll("favorites")).map((f) => f.id)).toEqual(["legacy-f"]);
  });
});
