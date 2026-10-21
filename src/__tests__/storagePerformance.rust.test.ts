import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createSqliteBackend } from "../storage/sqliteBackend";
import { idbBackend } from "../storage/idbBackend";
import type { CatalogWrite } from "../storage/backend";
import { startRustHarness } from "./rustHarness";

// Gate G3. Run: TIVIHUB_PERF=1 TIVIHUB_HARNESS_PROFILE=release npx vitest run storagePerformance
// The harness talks over a pipe, so transfer cost is comparable to (not the same as) Tauri's invoke.
const run = process.env.TIVIHUB_PERF === "1";

function catalog(): CatalogWrite {
  const channels = Array.from({ length: 200_000 }, (_, i) => ({
    id: `p:c${i}`, playlistId: "p", name: `Channel ${i}`, group: "News", streamUrl: `https://provider.example/live/${i}.m3u8`,
  }));
  const movies = Array.from({ length: 50_000 }, (_, i) => ({
    id: `p:m${i}`, playlistId: "p", name: `Movie ${i}`, streamUrl: `https://provider.example/movie/${i}.mp4`,
  }));
  return { playlistId: "p", channels, movies, series: [], episodes: [] } as CatalogWrite;
}

async function longestStall<T>(work: () => Promise<T>) {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 10);
    last = now;
  }, 10);
  try {
    return { result: await work(), worst };
  } finally {
    clearInterval(timer);
  }
}

describe.skipIf(!run)("catalog import and read at 200k channels + 50k movies", () => {
  it("imports and reads within the gate", async () => {
    const harness = startRustHarness();
    const sqlite = createSqliteBackend(harness.invoke);
    const data = catalog();
    await sqlite.tx([{ op: "put", store: "playlists", record: { id: "p", name: "p", type: "M3U", active: true, createdAt: 1 } as never }]);

    const sqliteImport = await longestStall(async () => {
      const t = performance.now();
      await sqlite.saveCatalog(data);
      return performance.now() - t;
    });
    const sqliteRead = await longestStall(async () => {
      const t = performance.now();
      await sqlite.getAllByIndex("channels", "byPlaylist", "p");
      return performance.now() - t;
    });
    harness.close();

    await idbBackend.tx([{ op: "put", store: "playlists", record: { id: "p", name: "p", type: "M3U", active: true, createdAt: 1 } as never }]);
    const idbImport = await longestStall(async () => {
      const t = performance.now();
      await idbBackend.saveCatalog(data);
      return performance.now() - t;
    });
    const idbRead = await longestStall(async () => {
      const t = performance.now();
      await idbBackend.getAllByIndex("channels", "byPlaylist", "p");
      return performance.now() - t;
    });

    console.log(JSON.stringify({
      sqlite: { importMs: Math.round(sqliteImport.result), readMs: Math.round(sqliteRead.result), importStallMs: Math.round(sqliteImport.worst), readStallMs: Math.round(sqliteRead.worst) },
      fakeIdb: { importMs: Math.round(idbImport.result), readMs: Math.round(idbRead.result), importStallMs: Math.round(idbImport.worst), readStallMs: Math.round(idbRead.worst) },
    }));
    expect(sqliteImport.worst).toBeLessThan(100);
  }, 600_000);
});
