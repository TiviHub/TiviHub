import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageBackend, StoreValues } from "../storage/backend";
import { idbBackend } from "../storage/idbBackend";
import { migrateToSqlite } from "../storage/migration";
import { memorySqlite } from "./memorySqlite";
import { seedIdb } from "./migrationFixtures";

afterEach(() => vi.restoreAllMocks());

describe("IndexedDB to SQLite migration", () => {
  it("copies every store, re-encrypts secrets, and leaves IndexedDB untouched", async () => {
    await seedIdb("m1");
    const sqlite = memorySqlite();
    const before = await idbBackend.getAll("channels");

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);

    expect(sqlite.meta.get("migrated_from_idb")).toBe("1");
    expect((await sqlite.getAll("channels")).map((c) => c.id)).toContain("m1-c");
    expect(await sqlite.get("subtitleFiles", 7)).toMatchObject({ name: "a.srt" });
    const copied = (await sqlite.getAll("playlists")).find((p) => p.id === "m1")!;
    expect(JSON.stringify(copied)).not.toContain("pw-m1");
    expect(await sqlite.decrypt((await sqlite.get("secrets", "mdblist-api-key"))!.payload)).toBe("mdb-secret");
    expect(await idbBackend.getAll("channels")).toEqual(before);
  });

  it("does nothing once migrated", async () => {
    await seedIdb("m2");
    const sqlite = memorySqlite();
    await migrateToSqlite(idbBackend, sqlite);
    const calls = sqlite.txCalls;
    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);
    expect(sqlite.txCalls).toBe(calls);
  });

  it("discards the copy and leaves the flag unset when verification fails", async () => {
    await seedIdb("m3");
    const sqlite = memorySqlite({ dropPuts: "favorites" });

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(false);

    expect(sqlite.meta.has("migrated_from_idb")).toBe(false);
    expect(await sqlite.getAll("channels")).toEqual([]);
    expect((await idbBackend.getAll("favorites")).length).toBeGreaterThan(0);
  });

  it("keeps a source whose credentials cannot be decrypted and flags it for re-entry", async () => {
    await seedIdb("m4");
    const brokenKey: StorageBackend = {
      ...idbBackend,
      decrypt: async () => {
        throw new Error("Local encrypted data could not be opened in this TiviHub installation.");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sqlite = memorySqlite();

    expect(await migrateToSqlite(brokenKey, sqlite)).toBe(true);

    const migrated = (await sqlite.getAll("playlists")).find((p) => p.id === "m4");
    expect(migrated).toMatchObject({ id: "m4", name: "m4", needsReentry: true });
    expect(migrated?.privateData).toBeUndefined();
    expect(await sqlite.get("secrets", "mdblist-api-key")).toBeUndefined();
  });

  it("marks a fresh install as migrated without touching IndexedDB", async () => {
    vi.spyOn(indexedDB, "databases").mockResolvedValue([]);
    const getAll = vi.spyOn(idbBackend, "getAll");
    const sqlite = memorySqlite();

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);

    expect(sqlite.meta.get("migrated_from_idb")).toBe("1");
    expect(getAll).not.toHaveBeenCalled();
  });

  it("completes without duplicates when relaunched after a crash mid-copy", async () => {
    await seedIdb("m6");
    const sqlite = memorySqlite();
    const realTx = sqlite.tx;
    let puts = 0;
    sqlite.tx = async (ops) => {
      if (ops.some((op) => op.op === "put") && ++puts === 3) throw new Error("crash");
      return realTx(ops);
    };

    await expect(migrateToSqlite(idbBackend, sqlite)).rejects.toThrow("crash");
    expect(sqlite.meta.has("migrated_from_idb")).toBe(false);

    sqlite.tx = realTx;
    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);
    const ids = (await sqlite.getAll("channels")).map((c) => c.id);
    expect(ids.filter((id) => id === "m6-c")).toHaveLength(1);
    expect(sqlite.meta.get("migrated_from_idb")).toBe("1");
  });

  it("migrates an IndexedDB that has only some stores populated", async () => {
    await idbBackend.tx([{ op: "put", store: "favorites", record: { id: "only-f", playlistId: "x" } as unknown as StoreValues["favorites"] }]);
    await idbBackend.tx([{ op: "clear", store: "channels" }, { op: "clear", store: "playlists" }, { op: "clear", store: "secrets" }]);
    const sqlite = memorySqlite();

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);

    expect((await sqlite.getAll("favorites")).map((f) => f.id)).toContain("only-f");
    expect(await sqlite.getAll("channels")).toEqual([]);
  });

  it("starts over from an empty copy after an interrupted attempt", async () => {
    await seedIdb("m5");
    const sqlite = memorySqlite();
    await sqlite.tx([{ op: "put", store: "channels", record: { id: "stale", playlistId: "gone", name: "x" } as StoreValues["channels"] }]);

    await migrateToSqlite(idbBackend, sqlite);

    expect((await sqlite.getAll("channels")).map((c) => c.id)).not.toContain("stale");
  });
});
