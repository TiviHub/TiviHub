import type { CatalogWrite, IndexName, StorageBackend, StorageOp, StoreName, StoreValues } from "./backend";

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface SqliteBackend extends StorageBackend {
  kind: "sqlite";
  /** Rejects when the database could not be opened at startup. */
  status(): Promise<void>;
  metaGet(key: string): Promise<string | null>;
  metaSet(key: string, value: string): Promise<void>;
  /** Empties every data table; used to discard a migration copy that failed verification. */
  wipe(): Promise<void>;
}

const CATALOG_BATCH_SIZE = 1000;

export function createSqliteBackend(invoke: Invoke): SqliteBackend {
  const parseList = async <S extends StoreName>(request: Promise<string>) =>
    JSON.parse(await request) as StoreValues[S][];

  async function stage(
    generation: string,
    store: "channels" | "movies" | "series" | "episodes",
    records: readonly unknown[],
    report: (count: number) => void,
  ) {
    for (let start = 0; start < records.length; start += CATALOG_BATCH_SIZE) {
      const batch = records.slice(start, start + CATALOG_BATCH_SIZE);
      await invoke("storage_stage", { generation, storeName: store, records: batch });
      report(batch.length);
    }
  }

  return {
    kind: "sqlite",
    status: () => invoke<void>("storage_status"),
    metaGet: (key) => invoke<string | null>("storage_meta_get", { key }),
    metaSet: (key, value) => invoke<void>("storage_meta_set", { key, value }),
    wipe: () => invoke<void>("storage_wipe"),
    async get<S extends StoreName>(store: S, key: string | number) {
      const json = await invoke<string | null>("storage_get", { storeName: store, key: String(key) });
      return json === null ? undefined : (JSON.parse(json) as StoreValues[S]);
    },
    getAll: <S extends StoreName>(store: S) =>
      parseList<S>(invoke<string>("storage_get_all", { storeName: store })),
    getAllByIndex: <S extends StoreName>(store: S, index: IndexName, value: string) =>
      parseList<S>(invoke<string>("storage_get_all_by_index", { storeName: store, index, value })),
    async tx(ops: StorageOp[]) {
      if (ops.length > 0) await invoke("storage_tx", { ops });
    },
    encrypt: (text) => invoke<string>("storage_encrypt", { text }),
    decrypt: (sealed) => invoke<string>("storage_decrypt", { sealed }),
    async saveCatalog(write: CatalogWrite) {
      const generation = crypto.randomUUID();
      const total = write.channels.length + write.movies.length + write.series.length +
        (write.episodes?.length ?? 0);
      let completed = 0;
      const report = (count: number) => {
        completed += count;
        write.onProgress?.(completed, total);
      };
      await stage(generation, "channels", write.channels, report);
      await stage(generation, "movies", write.movies, report);
      await stage(generation, "series", write.series, report);
      if (write.episodes) await stage(generation, "episodes", write.episodes, report);
      await invoke("storage_finish_catalog", {
        playlistId: write.playlistId,
        generation,
        sourceUpdate: write.sourceUpdate ?? null,
        includeEpisodes: write.episodes !== undefined,
      });
    },
    async deletePlaylist(id, onProgress) {
      const removed = await invoke<number>("storage_delete_playlist", { id });
      onProgress?.(removed, removed);
    },
  };
}
