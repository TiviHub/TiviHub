import { afterEach, describe, expect, it, vi } from "vitest";
import { keepBrowsedTitles } from "../services/catalogRefresh";
import { loadXtreamLiveCatalog } from "../providers/xtream";
import type { Movie, Playlist, Series } from "../types";

afterEach(() => vi.unstubAllGlobals());

const source: Playlist = {
  id: "x", name: "X", type: "XTREAM", url: "https://provider.example/", username: "u", password: "p",
  active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
};

describe("Xtream import", () => {
  it("asks for the login and the live channels only, never for movies or series", async () => {
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get("action") ?? "login";
      actions.push(action);
      const body = action === "login"
        ? { user_info: { auth: 1, exp_date: "2000000000" }, server_info: {} }
        : action === "get_live_categories"
          ? [{ category_id: "1", category_name: "News" }]
          : [{ stream_id: 7, name: "Late News", category_id: "1" }];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await loadXtreamLiveCatalog(source);

    expect(result.channels.map((channel) => channel.name)).toEqual(["Late News"]);
    expect(actions.sort()).toEqual(["get_live_categories", "get_live_streams", "login"]);
  });
});

describe("keepBrowsedTitles", () => {
  it("leaves the movies and series read while browsing out of the replacement", () => {
    const movie = { id: "m", playlistId: "x", name: "M", streamUrl: "u" } as Movie;
    const show = { id: "s", playlistId: "x", name: "S", seasons: 1 } as Series;
    const next = { channels: [], movies: [], series: [] };
    keepBrowsedTitles(next, { channels: [], movies: [movie], series: [show], episodes: [] });
    expect(next.movies).toEqual([movie]);
    expect(next.series).toEqual([show]);
  });
});
