import type { Playlist } from "../types";
import { STORE_NAMES, type StorageBackend, type StoredPlaylist, type StoreName } from "./backend";
import { fromStoredPlaylist, MDBLIST_KEY_ID, OPEN_SUBTITLES_KEY_ID, toStoredPlaylist } from "./codec";
import { idbDatabaseMayExist } from "./idbBackend";
import type { SqliteBackend } from "./sqliteBackend";

const MIGRATED_FLAG = "migrated_from_idb";
const COPY_BATCH_SIZE = 1000;
const SECRET_IDS = [OPEN_SUBTITLES_KEY_ID, MDBLIST_KEY_ID];
const PLAIN_STORES = STORE_NAMES.filter((store) => store !== "playlists" && store !== "secrets");

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

function sameRecords(a: unknown[], b: unknown[]): boolean {
  const left = a.map(canonical).sort();
  const right = b.map(canonical).sort();
  return left.length === right.length && left.every((record, index) => record === right[index]);
}

// Sealed credentials differ per backend and are compared as decrypted values instead.
function withoutSealed(playlist: Playlist): unknown {
  const { privateData, credentials, ...rest } = playlist as Playlist & Pick<StoredPlaylist, "privateData" | "credentials">;
  void privateData;
  void credentials;
  return rest;
}

async function copyPlaylists(idb: StorageBackend, sqlite: StorageBackend): Promise<Playlist[]> {
  const expected: Playlist[] = [];
  const stored = await idb.getAll("playlists");
  for (const record of stored) {
    let playlist: Playlist;
    try {
      playlist = await fromStoredPlaylist(idb, record);
    } catch (cause) {
      // The old key is gone or does not match: keep the source so the user can enter its credentials again.
      console.error("Could not decrypt a saved source during migration", cause);
      const { privateData, credentials, url, ...metadata } = record;
      void privateData;
      void credentials;
      void url;
      playlist = { ...metadata, url: "", username: "", password: "", needsReentry: true };
    }
    expected.push(playlist);
    await sqlite.tx([{ op: "put", store: "playlists", record: await toStoredPlaylist(sqlite, playlist) }]);
  }
  return expected;
}

async function copySecrets(idb: StorageBackend, sqlite: StorageBackend): Promise<Map<string, string>> {
  const expected = new Map<string, string>();
  for (const id of SECRET_IDS) {
    const secret = await idb.get("secrets", id);
    if (!secret) continue;
    try {
      const value = await idb.decrypt(secret.payload);
      expected.set(id, value);
      await sqlite.tx([{ op: "put", store: "secrets", record: { id, payload: await sqlite.encrypt(value) } }]);
    } catch (cause) {
      console.error("Could not decrypt a saved API key during migration", cause);
    }
  }
  return expected;
}

async function verify(
  idb: StorageBackend,
  sqlite: StorageBackend,
  playlists: Playlist[],
  secrets: Map<string, string>,
): Promise<string | null> {
  for (const store of PLAIN_STORES) {
    if (!sameRecords(await idb.getAll(store), await sqlite.getAll(store))) return `${store} differs`;
  }
  const copied = await Promise.all((await sqlite.getAll("playlists")).map((record) => fromStoredPlaylist(sqlite, record)));
  if (!sameRecords(playlists.map(withoutSealed), copied.map(withoutSealed))) return "playlists differ";
  const copiedSecrets = await sqlite.getAll("secrets");
  if (copiedSecrets.length !== secrets.size) return "secrets differ";
  for (const secret of copiedSecrets) {
    if ((await sqlite.decrypt(secret.payload)) !== secrets.get(secret.id)) return "secrets differ";
  }
  return null;
}

/**
 * Copies IndexedDB into SQLite once. IndexedDB is never modified. The migrated flag is only set
 * after every store has been read back and compared, so a bad copy can never replace good data.
 * Returns true when SQLite is the source of truth.
 */
export async function migrateToSqlite(idb: StorageBackend, sqlite: SqliteBackend): Promise<boolean> {
  if ((await sqlite.metaGet(MIGRATED_FLAG)) === "1") return true;
  if (!(await idbDatabaseMayExist())) {
    await sqlite.metaSet(MIGRATED_FLAG, "1");
    return true;
  }
  // A previous attempt may have left a partial copy; without the flag it is not authoritative.
  await sqlite.wipe();
  for (const store of PLAIN_STORES) {
    const records = await idb.getAll(store);
    for (let start = 0; start < records.length; start += COPY_BATCH_SIZE) {
      await sqlite.tx(
        records.slice(start, start + COPY_BATCH_SIZE).map((record) => ({ op: "put" as const, store: store as StoreName, record })),
      );
    }
  }
  const playlists = await copyPlaylists(idb, sqlite);
  const secrets = await copySecrets(idb, sqlite);
  const problem = await verify(idb, sqlite, playlists, secrets);
  if (problem) {
    console.error(`Discarding the SQLite copy: ${problem}`);
    await sqlite.wipe();
    return false;
  }
  await sqlite.metaSet(MIGRATED_FLAG, "1");
  return true;
}
