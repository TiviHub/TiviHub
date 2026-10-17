import { describe, expect, it } from "vitest";
import { searchCatalog } from "../globalSearch";
import type { LiveChannel, Movie, Series } from "../types";

function channel(id: string, name: string, group = "News"): LiveChannel {
  return {
    id,
    playlistId: "source",
    name,
    group,
    streamUrl: `https://provider.example/${id}.m3u8`,
  };
}

function movie(id: string, name: string, category = "Drama"): Movie {
  return {
    id,
    playlistId: "source",
    name,
    category,
    streamUrl: `https://provider.example/${id}.mp4`,
  };
}

function seriesItem(id: string, name: string, category = "Drama"): Series {
  return {
    id,
    playlistId: "source",
    name,
    category,
    seasons: 1,
  };
}

describe("global catalog search", () => {
  it("searches channel, movie, and series titles and categories case-insensitively", () => {
    const results = searchCatalog(
      "  nEwS  ",
      [channel("channel-1", "Evening News")],
      [movie("movie-1", "The Report", "News")],
      [seriesItem("series-1", "Newsroom")],
      false,
    );

    expect(results.channels.items.map((result) => result.item.name)).toEqual(["Evening News"]);
    expect(results.movies.items.map((result) => result.item.name)).toEqual(["The Report"]);
    expect(results.series.items.map((result) => result.item.name)).toEqual(["Newsroom"]);
  });

  it("honors the adult-content visibility setting", () => {
    const channels = [channel("adult-channel", "Late Night", "18+")];
    const movies = [movie("adult-movie", "Adult Movie")];

    expect(searchCatalog("late", channels, movies, [], false).channels.items).toEqual([]);
    expect(searchCatalog("adult", channels, movies, [], false).movies.items).toEqual([]);
    expect(searchCatalog("late", channels, movies, [], true).channels.items).toHaveLength(1);
    expect(searchCatalog("adult", channels, movies, [], true).movies.items).toHaveLength(1);
  });

  it("limits each type to eight results and reports additional matches", () => {
    const results = searchCatalog(
      "film",
      [],
      Array.from({ length: 10 }, (_, index) => movie(`movie-${index}`, `Film ${index}`)),
      [],
      true,
    );

    expect(results.movies.items).toHaveLength(8);
    expect(results.movies.hasMore).toBe(true);
  });
});
