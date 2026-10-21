import "fake-indexeddb/auto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { idbBackend } from "../storage/idbBackend";
import { migrateToSqlite } from "../storage/migration";
import { createSqliteBackend } from "../storage/sqliteBackend";
import { seedIdb } from "./migrationFixtures";
import { startRustHarness, type RustHarness } from "./rustHarness";

// IndexedDB side uses a real generated CryptoKey; the SQLite side is the real Rust store and keys.
const dir = mkdtempSync(path.join(os.tmpdir(), "tivihub-migration-"));
const dbPath = path.join(dir, "tivihub.sqlite3");
let harness: RustHarness | undefined;

afterEach(() => harness?.close());

function plaintextInFiles(needle: string): string[] {
  return readdirSync(dir).filter((name) => readFileSync(path.join(dir, name)).includes(needle));
}

describe("IndexedDB to the Rust SQLite store", () => {
  it("migrates with real encryption and leaves no plaintext credentials on disk", async () => {
    await seedIdb("r1");
    harness = startRustHarness(dbPath);
    const sqlite = createSqliteBackend(harness.invoke);

    expect(await migrateToSqlite(idbBackend, sqlite)).toBe(true);

    expect(await sqlite.metaGet("migrated_from_idb")).toBe("1");
    expect((await sqlite.getAll("channels")).map((c) => c.id)).toContain("r1-c");
    const stored = (await sqlite.getAll("playlists")).find((p) => p.id === "r1")!;
    expect(stored.privateData).toBeTruthy();
    expect(await sqlite.decrypt((await sqlite.get("secrets", "mdblist-api-key"))!.payload)).toBe("mdb-secret");
    harness.close();
    // The WAL holds recent writes until a checkpoint, so every file in the data dir is checked.
    expect(plaintextInFiles("r1-c").length).toBeGreaterThan(0); // control: the search can see stored data
    expect(plaintextInFiles("pw-r1")).toEqual([]);
    expect(plaintextInFiles("mdb-secret")).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("completes after a crash partway through, with no duplicate rows", async () => {
    await seedIdb("r2");
    const crashPath = path.join(mkdtempSync(path.join(os.tmpdir(), "tivihub-crash-")), "tivihub.sqlite3");
    harness = startRustHarness(crashPath);
    const real = createSqliteBackend(harness.invoke);
    let puts = 0;
    const crashing = { ...real, tx: async (ops: Parameters<typeof real.tx>[0]) => {
      if (++puts === 4) throw new Error("crash");
      return real.tx(ops);
    } };
    await expect(migrateToSqlite(idbBackend, crashing)).rejects.toThrow("crash");
    harness.close();

    harness = startRustHarness(crashPath);
    const reopened = createSqliteBackend(harness.invoke);
    expect(await reopened.metaGet("migrated_from_idb")).toBeNull();
    expect(await migrateToSqlite(idbBackend, reopened)).toBe(true);
    expect((await reopened.getAll("channels")).filter((c) => c.id === "r2-c")).toHaveLength(1);
  });
});
