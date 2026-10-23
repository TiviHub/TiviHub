import { describe, expect, it } from "vitest";
import { rankLocalCatalogByPopularity } from "../lib/catalogPopularity";
import type { MdblistPopularItem, Movie } from "../types";

const localMovies: Movie[] = [
  { id: "m1", playlistId: "p", name: "Local Movie One", year: 2020, imdbId: "tt1234567", streamUrl: "one" },
  { id: "m2", playlistId: "p", name: "The Local Movie Two (2022) 4K", year: 2022, streamUrl: "two" },
  { id: "m3", playlistId: "p", name: "Not In Popular", year: 2019, streamUrl: "three" },
];

describe("popular catalog matching", () => {
  it("orders only locally playable titles by MDBList popularity", () => {
    const popular: MdblistPopularItem[] = [
      { title: "The Local Movie Two", year: 2022, tmdbId: "22" },
      { title: "Local Movie One", year: 2020, imdbId: "tt1234567" },
      { title: "Unavailable Movie", year: 2025, tmdbId: "50" },
      { title: "Not In Popular", year: 2019 },
    ];

    expect(rankLocalCatalogByPopularity(localMovies, popular).map((movie) => movie.id)).toEqual(["m2", "m1", "m3"]);
  });

  it("does not title-match an item with mismatched external IDs or an unknown year", () => {
    const popular: MdblistPopularItem[] = [
      { title: "Local Movie One", year: 2020, imdbId: "tt7654321" },
      { title: "Not In Popular" },
    ];
    expect(rankLocalCatalogByPopularity(localMovies, popular)).toEqual([]);
  });
});
