// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStalkerLink,
  loadStalkerCatalog,
  loadStalkerEpg,
  normalizeMac,
  resolveStalkerLink,
  stalkerApiUrl,
  stalkerLink,
} from "../providers/stalker";
import type { Playlist } from "../types";

const MAC = "00:1A:79:12:34:56";

interface Call {
  params: URLSearchParams;
  headers: Record<string, string>;
}

let calls: Call[];
let rejectNext: number;

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
          { id: "101", name: "First", cmd: "/media/101.mpg", year: "2019", rating_imdb: "7.5", screenshot_uri: "/img/101.jpg", description: "A film" },
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
      const url = new URL(args.request.url);
      const headers = Object.fromEntries(args.request.headers.map(([name, value]) => [name.toLowerCase(), value]));
      calls.push({ params: url.searchParams, headers });
      if (rejectNext > 0 && url.searchParams.get("action") !== "handshake") {
        rejectNext -= 1;
        return { status: 401, headers: [], body: "" };
      }
      const key = `${url.searchParams.get("type")}:${url.searchParams.get("action")}`;
      const handler = handlers[key];
      const body = handler ? JSON.stringify({ js: handler(url.searchParams) }) : "<html>not found</html>";
      return { status: 200, headers: [], body: btoa(body) };
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

  it("keeps the live channels when the portal has no video library", async () => {
    portal({ "vod:get_categories": () => { throw new Error("no vod"); } });
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

  it("sends the login when the portal needs one", async () => {
    portal({ "stb:do_auth": () => true });
    await loadStalkerCatalog(source({ username: "user", password: "secret" }));
    const auth = calls.find((call) => call.params.get("action") === "do_auth");
    expect(auth?.params.get("login")).toBe("user");
    expect(auth?.params.get("password")).toBe("secret");
  });

  it("uses the playlist's own User-Agent instead of the set-top-box one", async () => {
    portal();
    await loadStalkerCatalog(source({ userAgent: "Custom/1" }));
    expect(calls[0].headers["user-agent"]).toBe("Custom/1");
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
