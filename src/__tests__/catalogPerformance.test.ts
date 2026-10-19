import { describe, expect, it, vi } from "vitest";
import { sortCatalogItems } from "../catalogSorting";
import { parseM3uCatalogAsync } from "../providers/m3u";
import { loadXtreamCatalog } from "../providers/xtream";
import type { Playlist } from "../types";

function playlistWithMovies(count: number): string {
  const lines = ["#EXTM3U"];
  for (let index = 0; index < count; index += 1) {
    lines.push(
      `#EXTINF:-1 group-title="Movies" year="${1980 + (index % 47)}",Movie ${index} (${1980 + (index % 47)})`,
      `https://provider.example/movie/${index}.mp4`,
    );
  }
  return lines.join("\n");
}

function percentile(values: number[], fraction: number): number {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * fraction) - 1];
}

function encodeRows<T>(count: number, createRow: (index: number) => T): string {
  return JSON.stringify(Array.from({ length: count }, (_, index) => createRow(index)));
}

describe("catalog performance benchmarks", () => {
  it("benchmarks parsing, year sorting, and search filtering at 10k and 50k items", async () => {
    const results: Array<Record<string, number>> = [];
    for (const count of [10_000, 50_000]) {
      const content = playlistWithMovies(count);
      const parseStart = performance.now();
      const catalog = await parseM3uCatalogAsync(content, { id: "benchmark", name: "Benchmark" });
      const parseMs = performance.now() - parseStart;
      expect(catalog.movies).toHaveLength(count);

      const sortStart = performance.now();
      const sorted = sortCatalogItems(catalog.movies, "year");
      const yearSortMs = performance.now() - sortStart;
      expect(sorted).toHaveLength(count);

      const indexed = sorted.map((item) => `${item.name} ${item.category ?? ""}`.toLowerCase());
      const searchSamples = Array.from({ length: 30 }, (_, index) => {
        const query = `movie ${index * 313}`;
        const searchStart = performance.now();
        indexed.filter((text) => text.includes(query));
        return performance.now() - searchStart;
      });
      results.push({
        count,
        parseMs: Number(parseMs.toFixed(2)),
        yearSortMs: Number(yearSortMs.toFixed(2)),
        searchP95Ms: Number(percentile(searchSamples, 0.95).toFixed(2)),
      });
    }
    console.log("Catalog performance:", JSON.stringify(results));
    expect(results.map((result) => result.count)).toEqual([10_000, 50_000]);
  });

  it("normalizes and searches a real-scale Xtream catalog without eagerly loading episodes", async () => {
    const playlist: Playlist = {
      id: "realistic-scale",
      name: "Realistic Scale",
      type: "XTREAM",
      url: "https://provider.example",
      username: "fixture-user",
      password: "fixture-password",
      active: true,
      drmLicenseUrl: "",
      drmSystem: "com.widevine.alpha",
      createdAt: 1,
    };
    const responses = new Map([
      ["authenticate", JSON.stringify({ user_info: { auth: 1, status: "Active" } })],
      ["get_live_categories", JSON.stringify([{ category_id: "1", category_name: "Live" }])],
      ["get_live_streams", encodeRows(55_680, (index) => ({
        stream_id: index + 1,
        name: `Channel ${index}`,
        category_id: "1",
        epg_channel_id: `guide.${index}`,
      }))],
      ["get_vod_categories", JSON.stringify([{ category_id: "2", category_name: "Movies" }])],
      ["get_vod_streams", encodeRows(214_204, (index) => ({
        stream_id: index + 1,
        name: `Movie ${index} (${1980 + (index % 47)})`,
        category_id: "2",
        container_extension: "mp4",
        plot: `Plot ${index}`,
      }))],
      ["get_series_categories", JSON.stringify([{ category_id: "3", category_name: "Series" }])],
      ["get_series", encodeRows(46_153, (index) => ({
        series_id: index + 1,
        name: `Series ${index}`,
        category_id: "3",
        seasons: [{ season_number: 1 }],
      }))],
    ]);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get("action") ?? "authenticate";
      const body = responses.get(action);
      if (!body) throw new Error(`Unexpected Xtream action: ${action}`);
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });

    const parseStart = performance.now();
    try {
      const catalog = await loadXtreamCatalog(playlist);
      const parseMs = performance.now() - parseStart;

      expect(catalog.channels).toHaveLength(55_680);
      expect(catalog.movies).toHaveLength(214_204);
      expect(catalog.series).toHaveLength(46_153);
      expect(Object.hasOwn(catalog, "episodes")).toBe(false);

      const sortStart = performance.now();
      const sortedMovies = sortCatalogItems(catalog.movies, "year");
      const sortMs = performance.now() - sortStart;
      const searchIndex = sortedMovies.map((item) => `${item.name} ${item.category ?? ""}`.toLowerCase());
      const searchStart = performance.now();
      const searchResults = searchIndex.filter((entry) => entry.includes("movie 214203"));
      const searchMs = performance.now() - searchStart;
      expect(sortedMovies).toHaveLength(214_204);
      expect(searchResults).toHaveLength(1);
      expect(parseMs).toBeLessThan(60_000);
      expect(sortMs).toBeLessThan(20_000);
      expect(searchMs).toBeLessThan(5_000);
      console.log("Realistic Xtream catalog performance:", JSON.stringify({
        channels: catalog.channels.length,
        movies: catalog.movies.length,
        series: catalog.series.length,
        episodesLoaded: false,
        parseMs: Number(parseMs.toFixed(2)),
        sortMs: Number(sortMs.toFixed(2)),
        searchMs: Number(searchMs.toFixed(2)),
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  }, 120_000);
});
