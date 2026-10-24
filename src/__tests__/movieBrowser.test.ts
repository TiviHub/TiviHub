import { describe, expect, it } from "vitest";
import { createMovieBrowser } from "../browse/movies";
import type { Movie, Playlist } from "../types";

const playlist = { id: "p1", name: "Source", type: "M3U", url: "https://provider.example/list.m3u" } as Playlist;
const movie = (name: string, category?: string): Movie => ({ id: name, playlistId: "p1", name, streamUrl: `https://x/${name}`, category });

describe("movie browser", () => {
  it("groups stored movies by category and sorts a whole category by name", async () => {
    const browser = createMovieBrowser(playlist, async () => [movie("Zulu", "Drama"), movie("Alpha", "Drama"), movie("Misc")]);
    expect(await browser.categories()).toEqual([
      { id: "Drama", name: "Drama", count: 2 },
      { id: "Uncategorized", name: "Uncategorized", count: 1 },
    ]);
    expect((await browser.page("Drama", undefined, undefined, undefined, "az")).items.map((item) => item.name)).toEqual(["Alpha", "Zulu"]);
    expect((await browser.page(null)).total).toBe(3);
  });
});
