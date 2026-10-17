import { describe, expect, it } from "vitest";
import type { Movie } from "../types";
import { sortCatalogItems, topCatalogItems } from "../catalogSorting";

function movie(
  id: string,
  name: string,
  metadata: Pick<Movie, "addedAtMillis" | "year" | "rating"> = {},
): Movie {
  return {
    id,
    playlistId: "playlist",
    name,
    streamUrl: `https://provider.example/${id}.mp4`,
    ...metadata,
  };
}

describe("catalog sorting", () => {
  const movies = [
    movie("10", "Film 10", { addedAtMillis: 100, year: 2020, rating: 7.5 }),
    movie("2", "Film 2", { addedAtMillis: 300, year: 2024, rating: 8.9 }),
    movie("missing", "Film 3"),
  ];

  it("sorts alphabetically and does not mutate the catalog", () => {
    expect(sortCatalogItems(movies, "name").map((item) => item.id)).toEqual(["2", "missing", "10"]);
    expect(movies.map((item) => item.id)).toEqual(["10", "2", "missing"]);
  });

  it("sorts latest additions first and puts titles without dates last", () => {
    expect(sortCatalogItems(movies, "added").map((item) => item.id)).toEqual(["2", "10", "missing"]);
  });

  it("sorts newest years first and puts titles without years last", () => {
    expect(sortCatalogItems(movies, "year").map((item) => item.id)).toEqual(["2", "10", "missing"]);
  });

  it("uses a year in the title when cached metadata has no year", () => {
    const items = [
      movie("2025", "Film (2025)"),
      movie("2023", "Film (2023)", { year: 2023 }),
      movie("unknown", "Film without year"),
    ];
    expect(sortCatalogItems(items, "year").map((item) => item.id)).toEqual(["2025", "2023", "unknown"]);
  });

  it("sorts highest ratings first and puts unrated titles last", () => {
    expect(sortCatalogItems(movies, "rating").map((item) => item.id)).toEqual(["2", "10", "missing"]);
  });

  it("selects the top five without mutating the catalog and alphabetizes rating ties", () => {
    expect(topCatalogItems(movies, "added", 3).map((item) => item.id)).toEqual(["2", "10"]);

    const items = [
      movie("delta", "Delta", { rating: 7.5 }),
      movie("alpha", "Alpha", { rating: 7.5 }),
      movie("bravo", "Bravo", { rating: 9.2 }),
      movie("echo", "Echo", { rating: 8 }),
      movie("foxtrot", "Foxtrot", { rating: 6 }),
      movie("charlie", "Charlie", { rating: 7.5 }),
      movie("missing", "Missing"),
    ];

    expect(topCatalogItems(items, "rating", 5).map((item) => item.id))
      .toEqual(["bravo", "echo", "alpha", "charlie", "delta"]);
    expect(topCatalogItems(items, "rating", 3).map((item) => item.id))
      .toEqual(["bravo", "echo", "alpha"]);
    expect(items.map((item) => item.id)).toEqual([
      "delta", "alpha", "bravo", "echo", "foxtrot", "charlie", "missing",
    ]);
  });
});
