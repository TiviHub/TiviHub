import type { StorageOp, StoreName } from "../storage/backend";
import type { SqliteBackend } from "../storage/sqliteBackend";

const KEY_FIELDS: Partial<Record<StoreName, string>> = {
  documents: "playlistId",
  ratings: "key",
  popularCatalog: "key",
  mdblistRateLimits: "key",
  subtitleSearch: "key",
  subtitleFiles: "fileId",
};

// Stands in for the Rust backend: JSON rows keyed like the real tables, strings as sealed payloads.
export function memorySqlite(options: { dropPuts?: StoreName } = {}): SqliteBackend & { meta: Map<string, string>; txCalls: number } {
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
