import "fake-indexeddb/auto";
import { vi } from "vitest";
import { startRustHarness } from "./rustHarness";
import { describeStorageContract } from "./storageContract";

// The same contract suite as storage.test.ts, answered by the real Rust store.
describeStorageContract("SQLite storage (Rust)", async () => {
  const harness = startRustHarness();
  vi.resetModules();
  vi.doMock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: harness.invoke }));
  const database = await import("../storage/database");
  return {
    database,
    incrementalDeleteProgress: false,
    rawPlaylist: async (id) => JSON.parse((await harness.invoke<string>("storage_get", { storeName: "playlists", key: id }))),
    close: harness.close,
  };
});
