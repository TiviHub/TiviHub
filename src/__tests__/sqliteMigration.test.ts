import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageBackend, StorageOp, StoreName, StoreValues } from "../storage/backend";
import { idbBackend } from "../storage/idbBackend";
import { migrateToSqlite } from "../storage/migration";
import type { SqliteBackend } from "../storage/sqliteBackend";
import { toStoredPlaylist } from "../storage/codec";
import type { Playlist } from "../types";

const KEY_FIELDS: Partial<Record<StoreName, string>> = {
  documents: "playlistId",
  ratings: "key",
  popularCatalog: "key",
  mdblistRateLimits: "key",
  subtitleSearch: "key",
  subtitleFiles: "fileId",
};

// Stands in for the Rust backend: JSON rows keyed like the real tables, strings as sealed payloads.
function memorySqlite(options: { dropPuts?: StoreName } = {}): SqliteBackend & { meta: Map<string, string>; txCalls: number } {
  const tables = new Map<string, Map<string, string>>();
  const meta = new Map<string, string>();
  const table = (store: string) => {
    if (!tables.has(store)) tables.set(store, new Map());
    return tables.get(store)!;
  };
  const backend = {
    kind: "sqlite" as const,
    meta,
    txCalls: 0,
    status: async () => undefined,
    metaGet: async (key: string) => meta.get(key) ?? null,
    metaSet: async (key: string, value: string) => void meta.set(key, value),
    wipe: async () => tables.clear(),
    get: async (store: StoreName, key: string | number) => {
      const json = table(store).get(String(key));
      return json === undefined ? undefined : JSON.parse(json);
    },
    getAll: async (store: StoreName) => [...table(store).values()].map((json) => JSON.parse(json)),
    getAllByIndex: async () => [],
    tx: async (ops: StorageOp[]) => {
      backend.txCalls += 1;
      for (const op of ops) {
        if (op.op === "put") {
          if (op.store === options.dropPuts) continue;
          const record = op.record as unknown as Record<string, unknown>;
          table(op.store).set(String(record[KEY_FIELDS[op.store] ?? "id"]), JSON.stringify(record));
        } else if (op.op === "delete") table(op.store).delete(op.key);
        else if (op.op === "clear") table(op.store).clear();
      }
    },
    encrypt: async (text: string) => `sealed:${btoa(text)}`,
    decrypt: async (sealed: unknown) => atob(String(sealed).replace("sealed:", "")),
    saveCatalog: async () => undefined,
    deletePlaylist: async () => undefined,
  };
  return backend as unknown as SqliteBackend & { meta: Map<string, string>; txCalls: number };
}

function playlist(id: string): Playlist {
  return {
    id,
    name: id,
    type: "XTREAM",
    url: "https://provider.example",
    username: `user-${id}`,
    password: `pw-${id}`,
    active: false,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: 1,
  };
}

async function seedIdb(id: string) {
  await idbBackend.tx([
    { op: "put", store: "playlists", record: await toStoredPlaylist(idbBackend, playlist(id)) },
    { op: "put", store: "channels", record: { id: `${id}-c`, playlistId: id, name: "Channel" } as StoreValues["channels"] },
    { op: "put", store: "favorites", record: { id: `${id}-f`, playlistId: id } as unknown as StoreValues["favorites"] },
    { op: "put", store: "subtitleFiles", record: { fileId: 7, name: "a.srt", contents: "x", fetchedAt: 1, expiresAt: 2 } },
    { op: "put", store: "secrets", record: { id: "mdblist-api-key", payload: await idbBackend.encrypt("mdb-secret") } },
    { op: "put", store: "secrets", record: { id: "open-subtitles-api-key", payload: await idbBackend.encrypt("os-secret") } },
  ]);
}

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

  it("starts over from an empty copy after an interrupted attempt", async () => {
    await seedIdb("m5");
    const sqlite = memorySqlite();
    await sqlite.tx([{ op: "put", store: "channels", record: { id: "stale", playlistId: "gone", name: "x" } as StoreValues["channels"] }]);

    await migrateToSqlite(idbBackend, sqlite);

    expect((await sqlite.getAll("channels")).map((c) => c.id)).not.toContain("stale");
  });
});
