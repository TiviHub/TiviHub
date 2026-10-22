import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIZES, categories, jsonArrayChunks, liveStreams, seriesList, userInfo, vodStreams,
} from "../../scripts/perf/dataset.mjs";
import { loadXtreamCatalog } from "../providers/xtream";
import type { Playlist } from "../types";

const take = <T>(rows: Iterable<T>): T[] => [...rows];

describe("perf dataset generator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives identical output for the same seed and different output for another", () => {
    expect(take(vodStreams(50, 7))).toEqual(take(vodStreams(50, 7)));
    expect(take(vodStreams(50, 7))).not.toEqual(take(vodStreams(50, 8)));
  });

  it("produces the sizes in the spec with unique ids", () => {
    expect(SIZES.L).toEqual({ channels: 54_000, movies: 214_000, series: 46_000 });
    const rows = take(liveStreams(SIZES.M.channels));
    expect(rows).toHaveLength(5_000);
    expect(new Set(rows.map((row) => row.stream_id)).size).toBe(5_000);
  });

  it("streams a valid JSON array in chunks", () => {
    const chunks = take(jsonArrayChunks(vodStreams(5_000), 1_000));
    expect(chunks.length).toBeGreaterThan(3);
    expect(JSON.parse(chunks.join(""))).toHaveLength(5_000);
    expect(JSON.parse(take(jsonArrayChunks([])).join(""))).toEqual([]);
  });

  it("is accepted by the real Xtream importer", async () => {
    const size = SIZES.S;
    const body = (action: string | null): unknown => {
      if (action === null) return userInfo("sentinel-user");
      if (action === "get_live_categories") return categories("live");
      if (action === "get_vod_categories") return categories("vod");
      if (action === "get_series_categories") return categories("series");
      if (action === "get_live_streams") return take(liveStreams(size.channels));
      if (action === "get_vod_streams") return take(vodStreams(size.movies));
      if (action === "get_series") return take(seriesList(size.series));
      throw new Error(`unexpected action ${action}`);
    };
    vi.stubGlobal("fetch", async (url: string) =>
      new Response(JSON.stringify(body(new URL(url).searchParams.get("action")))));
    const playlist: Playlist = {
      id: "perf", name: "Perf", type: "XTREAM", url: "http://127.0.0.1:1", username: "sentinel-user",
      password: "sentinel-pass", active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
    };

    const catalog = await loadXtreamCatalog(playlist);

    expect(catalog.channels).toHaveLength(size.channels);
    expect(catalog.movies).toHaveLength(size.movies);
    expect(catalog.series).toHaveLength(size.series);
    expect(new Set(catalog.movies.map((movie) => movie.id)).size).toBe(size.movies);
  });
});
