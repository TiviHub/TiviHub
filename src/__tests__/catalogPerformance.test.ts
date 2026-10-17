import { describe, expect, it } from "vitest";
import { sortCatalogItems } from "../catalogSorting";
import { parseM3uCatalogAsync } from "../providers/m3u";

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
});
