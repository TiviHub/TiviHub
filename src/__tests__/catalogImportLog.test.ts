// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCatalogImportLogSnapshot,
  recordCatalogImportSummary,
} from "../catalogImportLog";

beforeEach(() => {
  window.localStorage.clear();
});

describe("catalog import diagnostics", () => {
  it("stores bounded provider counts and timing without source content", () => {
    for (let index = 0; index < 22; index += 1) {
      recordCatalogImportSummary({
        provider: index % 2 === 0 ? "M3U" : "XTREAM",
        elapsedMillis: index * 10,
        channels: 55_680,
        movies: 214_204,
        series: 46_153,
        episodes: null,
      });
    }

    const snapshot = getCatalogImportLogSnapshot();
    expect(snapshot.storageAvailable).toBe(true);
    expect(snapshot.entries).toHaveLength(20);
    expect(snapshot.entries.at(-1)).toMatchObject({
      provider: "XTREAM",
      elapsedMillis: 210,
      channels: 55_680,
      movies: 214_204,
      series: 46_153,
      episodes: null,
    });
    expect(JSON.stringify(snapshot.entries)).not.toMatch(/playlist|password|provider\.example/i);
  });

  it("rejects invalid import metrics rather than recording misleading data", () => {
    expect(() => recordCatalogImportSummary({
      provider: "M3U",
      elapsedMillis: -1,
      channels: 0,
      movies: 0,
      series: 0,
      episodes: 0,
    })).toThrow("Catalog import diagnostics must contain valid counts and duration.");
  });
});
