// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStalkerLink,
  loadStalkerCatalog,
  loadStalkerEpg,
  loadStalkerEpisodes,
  normalizeMac,
  resolveStalkerLink,
  retryPolicy,
  startStalkerKeepAlive,
  stalkerApiUrl,
  stalkerLink,
  STALKER_LIBRARY_LIMIT,
} from "../providers/stalker";
import { rankLocalCatalogByPopularity } from "../lib/catalogPopularity";
import { createTitleIdentity } from "../lib/ratings";
import type { Playlist } from "../types";

const MAC = "00:1A:79:12:34:56";

interface Call {
  params: URLSearchParams;
  headers: Record<string, string>;
}

let calls: Call[];
let rejectNext: number;
/** Answers this many requests with HTTP 429 before behaving. */
let throttle: number;
/** Answers this many requests with a plain "Access denied." page (HTTP 200), as portals do for a dead session. */
let authText: number;
let inFlight: number;
let maxInFlight: number;
let slowMillis: number;

/** A tiny portal: one handshake token, genres, channels, two pages of movies, EPG and link creation. */
function portal(overrides: Record<string, (params: URLSearchParams) => unknown> = {}) {
  const handlers: Record<string, (params: URLSearchParams) => unknown> = {
    "stb:handshake": () => ({ token: "tok123" }),
    "stb:get_profile": () => ({ id: 1 }),
    "itv:get_genres": () => [{ id: "1", title: "News" }, { id: "2", title: "Radio" }],
    "itv:get_all_channels": () => ({
      data: [
        { id: "10", name: "One", cmd: "ffrt http://localhost/ch/10", tv_genre_id: "1", logo: "/logos/10.png" },
        { id: "11", name: "Jazz FM", cmd: "ffrt http://localhost/ch/11", tv_genre_id: "2" },
        { id: "12", name: "No command", tv_genre_id: "1" },
      ],
    }),
    "vod:get_categories": () => [{ id: "*", title: "All" }, { id: "5", title: "Action" }],
    "vod:get_ordered_list": (params) => params.get("p") === "2"
      ? { total_items: 3, max_page_items: 2, data: [{ id: "103", name: "Third", cmd: "/media/103.mpg" }] }
      : {
        total_items: 3,
        max_page_items: 2,
        data: [
          { id: "101", name: "First", cmd: "/media/101.mpg", category_id: "5", year: "2019", rating_imdb: "7.5", screenshot_uri: "/img/101.jpg", description: "A film" },
          { id: "102", name: "A show", cmd: "/media/102.mpg", series: [1, 2] },
        ],
      },
    "itv:get_epg_info": () => ({
      data: { 10: [{ name: "Evening news", start_timestamp: 1_000, stop_timestamp: 4_600, descr: "Headlines" }, { name: "Broken", start_timestamp: 9, stop_timestamp: 9 }] },
    }),
    "itv:create_link": (params) => ({ cmd: `ffmpeg http://stream.example/${params.get("cmd")?.split("/").pop()}?token=abc` }),
    ...overrides,
  };
  vi.stubGlobal("isTauri", true);
  vi.stubGlobal("__TAURI_INTERNALS__", {
    invoke: vi.fn(async (_command: string, args: { request: { url: string; headers: [string, string][] } }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (slowMillis > 0) await new Promise((resolve) => setTimeout(resolve, slowMillis));
        const url = new URL(args.request.url);
        const headers = Object.fromEntries(args.request.headers.map(([name, value]) => [name.toLowerCase(), value]));
        calls.push({ params: url.searchParams, headers });
        const action = url.searchParams.get("action");
        if (throttle > 0 && action !== "handshake") {
          throttle -= 1;
          return { status: 429, headers: [], body: "" };
        }
        if (rejectNext > 0 && action !== "handshake") {
          rejectNext -= 1;
          return { status: 401, headers: [], body: "" };
        }
        if (authText > 0 && action !== "handshake") {
          authText -= 1;
          return { status: 200, headers: [], body: btoa("Access denied.") };
        }
        const key = `${url.searchParams.get("type")}:${action}`;
        const handler = handlers[key];
        const body = handler ? JSON.stringify({ js: handler(url.searchParams) }) : "<html>not found</html>";
        return { status: 200, headers: [], body: btoa(body) };
      } finally {
        inFlight -= 1;
      }
    }),
  });
}

let counter = 0;
function source(extra: Partial<Playlist> = {}): Playlist {
  counter += 1;
  return {
    id: `stalker-${counter}`, name: "Portal", type: "STALKER", url: "http://portal.example/stalker_portal/c/",
    username: "", password: "", macAddress: MAC, active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha",
    createdAt: 0, ...extra,
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  calls = [];
  rejectNext = 0;
  throttle = 0;
  authText = 0;
  inFlight = 0;
  maxInFlight = 0;
  slowMillis = 0;
  retryPolicy.delaysMillis = [0, 0, 0];
});

afterEach(() => vi.unstubAllGlobals());

describe("Stalker addresses", () => {
  it("finds load.php behind the ways people paste a portal address", () => {
    expect(stalkerApiUrl("http://h.example/c/")).toBe("http://h.example/server/load.php");
    expect(stalkerApiUrl("http://h.example/stalker_portal/c")).toBe("http://h.example/stalker_portal/server/load.php");
    expect(stalkerApiUrl("http://h.example:8080")).toBe("http://h.example:8080/server/load.php");
    expect(stalkerApiUrl("http://h.example/portal.php?x=1")).toBe("http://h.example/portal.php");
  });

  it("accepts a MAC address in common spellings and rejects the rest", () => {
    expect(normalizeMac("00-1a-79-12-34-56")).toBe(MAC);
    expect(normalizeMac("001a79123456")).toBe(MAC);
    expect(normalizeMac("00:1A:79:12:34")).toBeNull();
    expect(normalizeMac("zz:1A:79:12:34:56")).toBeNull();
  });

  it("recognises the stand-in address the catalog keeps for a stream", () => {
    const link = stalkerLink("ffrt http://localhost/ch/10", "itv");
    expect(isStalkerLink(link)).toBe(true);
    expect(isStalkerLink("https://provider.example/live.m3u8")).toBe(false);
  });
});

describe("Stalker catalog", () => {
  it("logs in once with the MAC cookie, token and set-top-box User-Agent, then lists channels and movies", async () => {
    portal();
    const catalog = await loadStalkerCatalog(source());

    expect(calls.filter((call) => call.params.get("action") === "handshake")).toHaveLength(1);
    const first = calls[0];
    expect(first.headers.cookie).toContain(`mac=${MAC}`);
    expect(first.headers["user-agent"]).toContain("MAG250");
    expect(first.headers.authorization).toBeUndefined();
    expect(calls.at(-1)!.headers.authorization).toBe("Bearer tok123");

    expect(catalog.channels.map((channel) => channel.name)).toEqual(["One", "Jazz FM"]);
    expect(catalog.channels[0]).toMatchObject({
      group: "News",
      providerId: "10",
      logoUrl: "http://portal.example/logos/10.png",
    });
    expect(isStalkerLink(catalog.channels[0].streamUrl)).toBe(true);
    expect(catalog.channels[1].radio).toBe(true);
    expect(catalog.channels[0].radio).toBeUndefined();

    expect(catalog.movies.map((movie) => movie.name)).toEqual(["First", "Third"]);
    expect(catalog.movies[0]).toMatchObject({
      year: 2019, rating: 7.5, category: "Action", posterUrl: "http://portal.example/img/101.jpg", overview: "A film",
    });
  });

  it("gives movies what ratings and the Top 5 lists match on: a year, ids and the added date", async () => {
    portal({
      "vod:get_ordered_list": () => ({
        total_items: 4,
        max_page_items: 10,
        data: [
          { id: "1", name: "Old Film (2015)", cmd: "/m/1", added: "2021-05-01 12:34:56", imdb_id: "tt0123456", tmdb_id: "42" },
          { id: "2", name: "Plain Film", cmd: "/m/2", year: "2020-03-01" },
          { id: "3", name: "No year anywhere", cmd: "/m/3" },
          { id: "4", name: "Series flagged", cmd: "/m/4", is_series: "1" },
        ],
      }),
    });
    const { movies } = await loadStalkerCatalog(source());

    expect(movies.map((movie) => movie.name)).toEqual(["Old Film (2015)", "Plain Film", "No year anywhere"]);
    expect(movies[0]).toMatchObject({ year: 2015, imdbId: "tt0123456", tmdbId: "42" });
    expect(movies[0].addedAtMillis).toBe(new Date(2021, 4, 1, 12, 34, 56).getTime());
    expect(movies[1].year).toBe(2020);
    expect(movies[2].year).toBeUndefined();
    expect(movies[2].addedAtMillis).toBeUndefined();

    // The two features that were empty for Stalker movies now find them.
    expect(createTitleIdentity(movies[0], "MOVIE")?.key).toBe("movie:imdb:v2:tt0123456");
    expect(createTitleIdentity(movies[1], "MOVIE")?.key).toBe("movie:title:v3:plain film:2020");
    expect(rankLocalCatalogByPopularity(movies, [
      { title: "Plain Film", year: 2020 },
      { title: "Other", year: 2015, imdbId: "tt0123456" },
    ]).map((movie) => movie.name)).toEqual(["Plain Film", "Old Film (2015)"]);
  });

  it("keeps the live channels when the portal has no video library", async () => {
    portal({
      "vod:get_categories": () => { throw new Error("no vod"); },
      "vod:get_ordered_list": () => { throw new Error("no vod"); },
    });
    // The mock turns a thrown handler into a failed request; the catalog must still load.
    const catalog = await loadStalkerCatalog(source());
    expect(catalog.channels).toHaveLength(2);
    expect(catalog.movies).toEqual([]);
  });

  it("logs in again when the portal drops the token", async () => {
    portal();
    const playlist = source();
    await loadStalkerCatalog(playlist);
    const handshakes = () => calls.filter((call) => call.params.get("action") === "handshake").length;
    expect(handshakes()).toBe(1);

    rejectNext = 1;
    await expect(loadStalkerEpg(playlist)).resolves.toHaveLength(1);
    expect(handshakes()).toBe(2);
  });

  it("explains a refused MAC address and an unreadable portal", async () => {
    portal({ "stb:handshake": () => ({}) });
    await expect(loadStalkerCatalog(source())).rejects.toThrow(/did not accept this MAC address/);

    portal();
    await expect(loadStalkerCatalog(source({ macAddress: undefined }))).rejects.toThrow(/MAC address/);

    portal({ "stb:handshake": () => { throw new Error("x"); } });
    await expect(loadStalkerCatalog(source())).rejects.toThrow(/does not understand|could not be reached/);
  });

  it("logs in only when the profile asks for it, then reads the profile again", async () => {
    let profiles = 0;
    portal({
      "stb:get_profile": () => (profiles += 1) === 1 ? { status: 2 } : { status: 0 },
      "stb:do_auth": () => true,
    });
    await loadStalkerCatalog(source({ username: "user", password: "secret" }));

    const profileCalls = calls.filter((call) => call.params.get("action") === "get_profile");
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[0].params.get("auth_second_step")).toBeNull();
    expect(profileCalls[1].params.get("auth_second_step")).toBe("1");
    const auth = calls.find((call) => call.params.get("action") === "do_auth");
    expect(auth?.params.get("login")).toBe("user");
    expect(auth?.params.get("password")).toBe("secret");
  });

  it("does not send a login the portal did not ask for", async () => {
    portal({ "stb:do_auth": () => true });
    await loadStalkerCatalog(source({ username: "user", password: "secret" }));
    expect(calls.some((call) => call.params.get("action") === "do_auth")).toBe(false);
  });

  it("explains a portal that wants a login nobody entered, and a blocked box", async () => {
    portal({ "stb:get_profile": () => ({ status: 2 }) });
    await expect(loadStalkerCatalog(source())).rejects.toThrow(/asks for a login/);

    portal({ "stb:get_profile": () => ({ status: 1, block_msg: "Account suspended" }) });
    await expect(loadStalkerCatalog(source())).rejects.toThrow("Account suspended");

    portal({ "stb:get_profile": () => ({ status: 2 }), "stb:do_auth": () => true });
    await expect(loadStalkerCatalog(source({ username: "user", password: "wrong" }))).rejects.toThrow(/did not accept this login/);
  });

  it("uses the playlist's own User-Agent instead of the set-top-box one", async () => {
    portal();
    await loadStalkerCatalog(source({ userAgent: "Custom/1" }));
    expect(calls[0].headers["user-agent"]).toBe("Custom/1");
  });
});

describe("Stalker library size", () => {
  it("reads the newest titles from the portal's all category instead of walking every category", async () => {
    portal();
    await loadStalkerCatalog(source());
    const lists = calls.filter((call) => call.params.get("action") === "get_ordered_list" && !call.params.get("movie_id"));
    expect(lists.length).toBeGreaterThan(0);
    expect(new Set(lists.map((call) => call.params.get("category")))).toEqual(new Set(["*"]));
    expect(lists[0].params.get("sortby")).toBe("added");
  });

  it("stops at the import limit on a huge portal", async () => {
    let requested = 0;
    portal({
      "vod:get_ordered_list": (params) => {
        requested += 1;
        const page = Number(params.get("p"));
        return { total_items: 200_000, max_page_items: 14, data: [{ id: `m${page}`, name: `Movie ${page}`, cmd: `/m/${page}` }] };
      },
      "series:get_categories": () => [],
      "series:get_ordered_list": () => ({ total_items: 0, max_page_items: 14, data: [] }),
    });
    const { movies } = await loadStalkerCatalog(source());
    expect(requested).toBe(Math.ceil(STALKER_LIBRARY_LIMIT / 14));
    expect(movies).toHaveLength(Math.ceil(STALKER_LIBRARY_LIMIT / 14));
  });

  it("falls back to the first page of each category when the all category is empty", async () => {
    portal({
      "vod:get_categories": () => [{ id: "5", title: "Action" }, { id: "6", title: "Drama" }],
      "vod:get_ordered_list": (params) => params.get("category") === "*"
        ? { total_items: 0, max_page_items: 14, data: [] }
        : { total_items: 40, max_page_items: 14, data: [{ id: `c${params.get("category")}`, name: `Film ${params.get("category")}`, cmd: "/m", category_id: params.get("category") }] },
    });
    const { movies } = await loadStalkerCatalog(source());
    expect(movies.map((movie) => [movie.name, movie.category])).toEqual([["Film 5", "Action"], ["Film 6", "Drama"]]);
  });

  it("keeps the series when the movie library fails, and the movies when the series library fails", async () => {
    portal({
      "vod:get_ordered_list": () => { throw new Error("vod down"); },
      "series:get_categories": () => [{ id: "7", title: "Drama" }],
      "series:get_ordered_list": () => ({ total_items: 1, max_page_items: 14, data: [{ id: "1", name: "Still here" }] }),
    });
    const withoutMovies = await loadStalkerCatalog(source());
    expect(withoutMovies.movies).toEqual([]);
    expect(withoutMovies.series.map((item) => item.name)).toEqual(["Still here"]);

    portal({ "series:get_ordered_list": () => { throw new Error("series down"); } });
    const withoutSeries = await loadStalkerCatalog(source());
    expect(withoutSeries.movies.length).toBeGreaterThan(0);
  });
});

describe("Stalker request behaviour", () => {
  it("waits and repeats a request the portal throttles with HTTP 429", async () => {
    portal();
    throttle = 2;
    await expect(loadStalkerEpg(source())).resolves.toHaveLength(1);
    // The login's first request was refused twice and repeated until the portal answered.
    expect(calls.filter((call) => call.params.get("action") === "get_profile")).toHaveLength(3);
  });

  it("gives up with a clear message when the portal keeps refusing", async () => {
    portal();
    throttle = 10;
    await expect(loadStalkerEpg(source())).rejects.toThrow(/limiting requests/);
  });

  it("never has more than four requests in flight", async () => {
    portal({
      "vod:get_ordered_list": (params) => ({
        total_items: 14 * 30,
        max_page_items: 14,
        data: [{ id: `m${params.get("p")}`, name: `Movie ${params.get("p")}`, cmd: "/m" }],
      }),
    });
    slowMillis = 3;
    const { movies } = await loadStalkerCatalog(source());
    expect(movies.length).toBe(30);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("treats a plain \"Access denied.\" answer as a dead session and logs in again", async () => {
    portal();
    const playlist = source();
    await loadStalkerCatalog(playlist);
    const handshakes = () => calls.filter((call) => call.params.get("action") === "handshake").length;
    expect(handshakes()).toBe(1);

    authText = 1;
    await expect(loadStalkerEpg(playlist)).resolves.toHaveLength(1);
    expect(handshakes()).toBe(2);
  });
});

describe("Stalker stream addresses", () => {
  const channelsWith = (rows: Record<string, unknown>[]) => portal({
    "itv:get_all_channels": () => ({ data: rows }),
    "vod:get_ordered_list": () => ({ total_items: 0, max_page_items: 10, data: [] }),
  });

  it("plays a row from its stored address when it says it needs no temporary link, and asks the portal for the others", async () => {
    channelsWith([
      { id: "1", name: "Static", cmd: "ffmpeg http://cdn.example/live/1.m3u8", use_http_tmp_link: "0", use_load_balancing: "0" },
      { id: "2", name: "Temporary", cmd: "ffmpeg http://cdn.example/live/2.m3u8", use_http_tmp_link: "1", use_load_balancing: "0" },
      { id: "3", name: "Balanced", cmd: "ffmpeg http://cdn.example/live/3.m3u8", use_http_tmp_link: "0", use_load_balancing: "1" },
      { id: "4", name: "No flags", cmd: "ffmpeg http://cdn.example/live/4.m3u8" },
      { id: "5", name: "Portal host", cmd: "ffmpeg http://portal.example/play/live.php?mac=00:1A:79:00:00:01&stream=5&extension=ts&play_token=abc", use_http_tmp_link: "0", use_load_balancing: "0" },
      { id: "8", name: "Keeps ts elsewhere", cmd: "ffmpeg http://cdn.example/live/8.ts?extension=ts", use_http_tmp_link: 0, use_load_balancing: 0 },
      { id: "6", name: "Localhost", cmd: "ffrt http://localhost/ch/6", use_http_tmp_link: "0", use_load_balancing: "0" },
      { id: "7", name: "Relative", cmd: "/media/7", use_http_tmp_link: "0", use_load_balancing: "0" },
    ]);
    const { channels } = await loadStalkerCatalog(source());
    const byName = Object.fromEntries(channels.map((channel) => [channel.name, channel.streamUrl]));

    expect(byName.Static).toBe("http://cdn.example/live/1.m3u8");
    // The portal's own address is played as stored, with the HLS form asked for instead of raw TS.
    expect(byName["Portal host"]).toBe("http://portal.example/play/live.php?mac=00:1A:79:00:00:01&stream=5&extension=m3u8&play_token=abc");
    expect(byName["Keeps ts elsewhere"]).toBe("http://cdn.example/live/8.ts?extension=m3u8");
    for (const name of ["Temporary", "Balanced", "No flags", "Localhost", "Relative"]) {
      expect(isStalkerLink(byName[name]), name).toBe(true);
    }
  });
});

describe("Stalker lazy series in the video library", () => {
  it("opens seasons and episodes of an is_series item through the video library", async () => {
    portal({
      "vod:get_ordered_list": (params) => {
        if (!params.get("movie_id")) {
          return { total_items: 1, max_page_items: 10, data: [{ id: "90", name: "Lazy Show", cmd: "/m/90", is_series: "1", year: "2020" }] };
        }
        if (params.get("season_id") === "0") {
          return { total_items: 2, max_page_items: 10, data: [
            { id: "90:0", name: "Extras", is_season: "1", season_number: "0", cmd: "extras" },
            { id: "90:1", name: "Season 1", is_season: "1", cmd: "s1" },
          ] };
        }
        return { total_items: 1, max_page_items: 10, data: [{ id: "x", name: "Pilot", cmd: "pilot", series_number: "1" }] };
      },
      "series:get_categories": () => [],
      "series:get_ordered_list": () => ({ total_items: 0, max_page_items: 10, data: [] }),
    });
    const playlist = source();
    const { series } = await loadStalkerCatalog(playlist);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ providerId: "vod:90", stalkerEpisodes: [] });

    const episodes = await loadStalkerEpisodes(playlist, series[0]);
    expect(episodes.map((episode) => [episode.season, episode.number, episode.name])).toEqual([[0, 1, "Pilot"], [1, 1, "Pilot"]]);
    const levelRequests = calls.filter((call) => call.params.get("movie_id"));
    expect(levelRequests.every((call) => call.params.get("type") === "vod")).toBe(true);
  });
});

describe("Stalker keep-alive", () => {
  afterEach(() => vi.useRealTimers());

  it("pings get_events once at the start and then at the interval the portal asks for, until stopped", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    portal({
      "stb:get_profile": () => ({ status: 0, watchdog_timeout: 45 }),
      "watchdog:get_events": () => ({ data: [] }),
    });
    const events = () => calls.filter((call) => call.params.get("type") === "watchdog");

    const stop = startStalkerKeepAlive(source());
    // The login hashes the device id with real (not faked) crypto, so wait for the first ping to arrive.
    await vi.waitFor(() => expect(events().map((call) => call.params.get("init"))).toEqual(["1"]));

    await vi.advanceTimersByTimeAsync(45_000);
    await vi.waitFor(() => expect(events().map((call) => call.params.get("init"))).toEqual(["1", "0"]));

    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(events()).toHaveLength(2);
  });

  it("keeps going after a failed ping", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    portal({
      "stb:get_profile": () => ({ status: 0, watchdog_timeout: 30 }),
      "watchdog:get_events": () => { throw new Error("portal hiccup"); },
    });
    const events = () => calls.filter((call) => call.params.get("type") === "watchdog");
    const stop = startStalkerKeepAlive(source());
    await vi.waitFor(() => expect(events()).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(events()).toHaveLength(3));
    stop();
  });
});

describe("Stalker series", () => {
  const seriesPortal = () => portal({
    "vod:get_ordered_list": () => ({ total_items: 0, max_page_items: 10, data: [] }),
    "series:get_categories": () => [{ id: "7", title: "Drama" }],
    "series:get_ordered_list": (params) => {
      if (!params.get("movie_id")) {
        return { total_items: 1, max_page_items: 10, data: [{ id: "500", name: "Big Show (2018)", category_id: "7", screenshot_uri: "/s.jpg", description: "Plot" }] };
      }
      if (params.get("season_id") === "0") {
        return {
          total_items: 2,
          max_page_items: 10,
          data: [
            { id: "500:1", name: "Season 1", is_season: "1", cmd: "season-one" },
            { id: "500:2", name: "Season 2", is_season: "1", cmd: "season-two", series: [1, 2] },
          ],
        };
      }
      return {
        total_items: 2,
        max_page_items: 10,
        data: [
          { id: "e1", name: "Pilot", cmd: "episode-one", series_number: "1" },
          { id: "e2", name: "The second", cmd: "episode-two", series_number: "2" },
        ],
      };
    },
    "vod:create_link": (params) => ({ cmd: `ffmpeg http://stream.example/${params.get("cmd")}-${params.get("series")}` }),
  });

  it("lists the series of the portal's series library with a year taken from the name", async () => {
    seriesPortal();
    const playlist = source();
    const { series } = await loadStalkerCatalog(playlist);

    expect(series.map((item) => item.name)).toEqual(["Big Show (2018)"]);
    expect(series[0]).toMatchObject({
      id: `${playlist.id}:series:series:500`,
      providerId: "series:500",
      year: 2018,
      category: "Drama",
      posterUrl: "http://portal.example/s.jpg",
      overview: "Plot",
    });
  });

  it("opens seasons and episodes one level at a time and keeps each episode's stream request", async () => {
    seriesPortal();
    const playlist = source();
    const [show] = (await loadStalkerCatalog(playlist)).series;
    const episodes = await loadStalkerEpisodes(playlist, show);

    expect(episodes.map((episode) => `S${episode.season}E${episode.number} ${episode.name}`)).toEqual([
      "S1E1 Pilot", "S1E2 The second", "S2E1 Episode 1", "S2E2 Episode 2",
    ]);
    expect(new Set(episodes.map((episode) => episode.id)).size).toBe(4);
    expect(await resolveStalkerLink(playlist, episodes[0].streamUrl)).toBe("http://stream.example/episode-one-");
    // Episodes listed under one season command are told apart by their number.
    expect(await resolveStalkerLink(playlist, episodes[3].streamUrl)).toBe("http://stream.example/season-two-2");
  });

  it("treats a video-library item with a list of episode numbers as a one-season series", async () => {
    portal({
      "vod:get_ordered_list": () => ({
        total_items: 2,
        max_page_items: 10,
        data: [
          { id: "90", name: "Old Show", cmd: "/media/90.mpg", series: [1, 2, 3] },
          { id: "91", name: "A Film", cmd: "/media/91.mpg" },
        ],
      }),
      "vod:create_link": (params) => ({ cmd: `ffmpeg http://stream.example/${params.get("series")}` }),
    });
    const playlist = source();
    const catalog = await loadStalkerCatalog(playlist);

    expect(catalog.movies.map((movie) => movie.name)).toEqual(["A Film"]);
    expect(catalog.series[0]).toMatchObject({ providerId: "vod:90", stalkerCmd: "/media/90.mpg", stalkerEpisodes: [1, 2, 3] });
    const episodes = await loadStalkerEpisodes(playlist, catalog.series[0]);
    expect(episodes.map((episode) => episode.number)).toEqual([1, 2, 3]);
    expect(await resolveStalkerLink(playlist, episodes[1].streamUrl)).toBe("http://stream.example/2");
  });

  it("explains a series the portal returns no episodes for", async () => {
    portal({
      "vod:get_ordered_list": () => ({ total_items: 0, max_page_items: 10, data: [] }),
      "series:get_categories": () => [{ id: "7", title: "Drama" }],
      "series:get_ordered_list": (params) => params.get("movie_id")
        ? { total_items: 0, max_page_items: 10, data: [] }
        : { total_items: 1, max_page_items: 10, data: [{ id: "1", name: "Empty" }] },
    });
    const playlist = source();
    const [show] = (await loadStalkerCatalog(playlist)).series;
    await expect(loadStalkerEpisodes(playlist, show)).rejects.toThrow(/no episodes/);
  });
});

describe("Stalker guide and stream links", () => {
  it("reads programmes for every channel in one request", async () => {
    portal();
    const playlist = source();
    const programs = await loadStalkerEpg(playlist);
    expect(programs).toEqual([{
      id: `${playlist.id}:10:1000`,
      channelId: `${playlist.id}:live:10`,
      title: "Evening news",
      synopsis: "Headlines",
      startMillis: 1_000_000,
      endMillis: 4_600_000,
      source: playlist.id,
    }]);
  });

  it("asks the portal for a fresh address and drops the player hint", async () => {
    portal();
    const link = stalkerLink("/media/103.mpg", "itv");
    expect(await resolveStalkerLink(source(), link)).toBe("http://stream.example/103.mpg?token=abc");
    expect(calls.at(-1)!.params.get("type")).toBe("itv");
  });

  it("uses the video library endpoint for movies and explains a missing address", async () => {
    portal({ "vod:create_link": () => ({ cmd: "" }) });
    await expect(resolveStalkerLink(source(), stalkerLink("/media/1.mpg", "vod"))).rejects.toThrow(/did not give a stream address/);
    expect(calls.at(-1)!.params.get("type")).toBe("vod");
  });
});
