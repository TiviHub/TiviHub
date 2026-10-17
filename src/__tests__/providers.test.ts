import { afterEach, describe, expect, it, vi } from "vitest";
import demoM3u from "../fixtures/demo.m3u?raw";
import { fetchM3u, parseM3u, parseM3uCatalog, parseM3uCatalogAsync } from "../providers/m3u";
import { downloadOpenSubtitle, searchOpenSubtitles } from "../providers/opensubtitles";
import { parseXmltvDate } from "../providers/xmltv";
import {
  loadXtreamCatalog,
  loadXtreamShortEpg,
  xtreamStreamUrl,
  xtreamXmltvUrl,
} from "../providers/xtream";
import type { Playlist } from "../types";

afterEach(() => vi.unstubAllGlobals());

describe("M3U provider parsing", () => {
  it("parses quoted metadata and resolves relative stream URLs", () => {
    const channels = parseM3u(
      '#EXTM3U\n#EXTINF:-1 tvg-id="news.1" tvg-logo="https://cdn.example/logo.png" group-title="News, World",Evening News\nstreams/news.m3u8\n',
      { id: "list-1", name: "News", url: "https://provider.example/playlists/main.m3u" },
    );

    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      id: "list-1:live:0",
      name: "Evening News",
      group: "News, World",
      tvgId: "news.1",
      logoUrl: "https://cdn.example/logo.png",
      streamUrl: "https://provider.example/playlists/streams/news.m3u8",
    });
  });

  it("rejects missing extended M3U headers and unsupported stream schemes", () => {
    expect(() => parseM3u("https://provider.example/stream.m3u8", { id: "bad", name: "Bad" }))
      .toThrow(/missing #EXTM3U/i);
    expect(() => parseM3u("#EXTM3U\n#EXTINF:-1,Channel\njavascript:alert(1)", { id: "bad", name: "Bad" }))
      .toThrow(/HTTP or HTTPS/);
  });

  it("separates live, movie, and episodic entries from a realistic grouped M3U", () => {
    const catalog = parseM3uCatalog(demoM3u, { id: "demo", name: "Demo" });

    expect(catalog.channels).toHaveLength(3);
    expect(catalog.movies).toHaveLength(2);
    expect(catalog.series).toHaveLength(1);
    expect(catalog.series[0]).toMatchObject({ name: "Open Film Showcase", seasons: 1 });
    expect(catalog.episodes).toHaveLength(2);
    expect(catalog.episodes.map((episode) => [episode.season, episode.number, episode.name]))
      .toEqual([[1, 1, "Big Buck Bunny"], [1, 2, "Tears of Steel"]]);
    expect(catalog.movies[0]).toMatchObject({ name: "Big Buck Bunny (2008)", year: 2008, rating: 8 });
  });

  it("parses playlists in chunks while yielding to the UI", async () => {
    const content = [
      "#EXTM3U",
      `#${"x".repeat(256 * 1024)}`,
      '#EXTINF:-1 group-title="Movies",Movie 🎬 (2024)',
      "https://provider.example/movie.mp4",
    ].join("\n");
    const expected = parseM3uCatalog(content, { id: "chunked", name: "Chunked" });
    let yielded = false;
    const timer = setTimeout(() => { yielded = true; }, 0);
    const actual = await parseM3uCatalogAsync(content, { id: "chunked", name: "Chunked" });
    clearTimeout(timer);

    expect(actual).toEqual(expected);
    expect(yielded).toBe(true);
  });

  it("stops incremental parsing when its signal is aborted", async () => {
    const controller = new AbortController();
    const content = `#EXTM3U\n#${"x".repeat(512 * 1024)}\n#EXTINF:-1,Channel\nhttps://provider.example/live.m3u8`;
    const parsing = parseM3uCatalogAsync(content, { id: "cancelled", name: "Cancelled" }, controller.signal);
    controller.abort();

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });

  it("parses M3U files larger than 25 MB", () => {
    const comment = "#".concat("x".repeat(25 * 1024 * 1024));
    const content = `#EXTM3U\n${comment}\n#EXTINF:-1,Channel\nhttps://provider.example/live.m3u8\n`;
    expect(parseM3uCatalog(content, { id: "large", name: "Large" }).channels).toHaveLength(1);
  });

  it("fetches M3U playlists larger than the former 25 MB limit", async () => {
    const content = "#EXTM3U\n";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(content, {
      status: 200,
      headers: { "Content-Length": String(26 * 1024 * 1024) },
    })));

    await expect(fetchM3u("https://provider.example/large.m3u")).resolves.toBe(content);
  });

  it("rejects M3U responses larger than 200 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("#EXTM3U\n", {
      status: 200,
      headers: { "Content-Length": String(201 * 1024 * 1024) },
    })));

    await expect(fetchM3u("https://provider.example/large.m3u")).rejects.toThrow(/200 MB limit/);
  });
});

describe("XMLTV dates", () => {
  it("converts explicit XMLTV offsets to UTC", () => {
    expect(parseXmltvDate("20250101123000 +0200"))
      .toBe(Date.UTC(2025, 0, 1, 10, 30, 0));
    expect(parseXmltvDate("20250101123000 -0530"))
      .toBe(Date.UTC(2025, 0, 1, 18, 0, 0));
  });

  it("rejects impossible dates and malformed offsets", () => {
    expect(parseXmltvDate("20250230120000 +0000")).toBeNull();
    expect(parseXmltvDate("20250101120000 +2460")).toBeNull();
    expect(parseXmltvDate("not-a-date")).toBeNull();
  });
});

describe("OpenSubtitles provider", () => {
  it("filters search results to usable subtitle files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{
        attributes: {
          language: "en",
          release: "Web",
          download_count: 12,
          files: [
            { file_id: 81, file_name: "episode.srt" },
            { file_id: 82, file_name: "archive.zip" },
            { file_id: "bad", file_name: "invalid.vtt" },
          ],
        },
      }],
    }), { status: 200 })));

    await expect(searchOpenSubtitles("local-test-key", "Example show")).resolves.toEqual([{
      fileId: 81,
      fileName: "episode.srt",
      language: "en",
      release: "Web",
      downloadCount: 12,
    }]);
  });

  it("downloads subtitle text only from a secure provider link", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/download")) {
        return new Response(JSON.stringify({
          link: "https://cdn.opensubtitles.example/subtitle",
          file_name: "episode.srt",
        }), { status: 200 });
      }
      return new Response("1\n00:00:01,000 --> 00:00:02,000\nHello\n", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadOpenSubtitle("local-test-key", 81)).resolves.toEqual({
      name: "episode.srt",
      contents: "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Xtream URL construction", () => {
  const playlist: Playlist = {
    id: "xtream-1",
    name: "Provider",
    type: "XTREAM",
    url: "https://provider.example:8443/base/",
    username: "user name",
    password: "pass/word",
    active: true,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: 1,
  };

  it("encodes provider path credentials and preserves a server base path", () => {
    expect(xtreamStreamUrl(playlist, "movie", "99", "mkv"))
      .toBe("https://provider.example:8443/base/movie/user%20name/pass%2Fword/99.mkv");
    const guide = new URL(xtreamXmltvUrl(playlist));
    expect(guide.pathname).toBe("/base/xmltv.php");
    expect(guide.searchParams.get("username")).toBe("user name");
    expect(guide.searchParams.get("password")).toBe("pass/word");
  });

  it("maps provider categories and streams into the local catalog", async () => {
    const responses: Record<string, unknown> = {
      "": { user_info: { auth: 1, status: "Active" } },
      get_live_categories: [{ category_id: "1", category_name: "News" }],
      get_live_streams: [{ stream_id: 101, name: "Evening News", category_id: "1", epg_channel_id: "news.demo" }],
      get_vod_categories: [],
      get_vod_streams: [{ stream_id: 201, name: "Example Film", releaseDate: "18/11/2025", container_extension: "mkv", category_id: "9", rating: "7.6" }],
      get_series_categories: [{ category_id: "2", category_name: "Drama" }],
      get_series: [{ series_id: 301, name: "Example Show", category_id: "2", year: "2018 - 2024", rating_5based: "4.2", seasons: [{ season_number: 1 }] }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify(responses[url.searchParams.get("action") ?? ""]), {
        status: 200,
        headers: {
          "Content-Length": String(101 * 1024 * 1024),
          "Content-Type": "application/json",
        },
      });
    }));

    const catalog = await loadXtreamCatalog(playlist);
    expect(catalog.channels[0]).toMatchObject({
      name: "Evening News",
      group: "News",
      tvgId: "news.demo",
      streamUrl: "https://provider.example:8443/base/live/user%20name/pass%2Fword/101.m3u8",
    });
    expect(catalog.movies[0]).toMatchObject({
      name: "Example Film",
      category: "Uncategorized",
      year: 2025,
      rating: 7.6,
      streamUrl: "https://provider.example:8443/base/movie/user%20name/pass%2Fword/201.mkv",
    });
    expect(catalog.series[0]).toMatchObject({
      name: "Example Show",
      category: "Drama",
      seasons: 1,
      year: 2024,
      rating: 4.2,
    });
  });

  it("rejects Xtream responses larger than 200 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      user_info: { auth: 1, status: "Active" },
    }), {
      status: 200,
      headers: {
        "Content-Length": String(201 * 1024 * 1024),
        "Content-Type": "application/json",
      },
    })));

    await expect(loadXtreamCatalog(playlist)).rejects.toThrow(/200 MB limit/);
  });

  it("loads a bounded short guide per channel and decodes provider text", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      epg_listings: [{
        title: "RXZlbmluZyBOZXdz",
        description: "VG9wIGhlYWRsaW5lcy4=",
        start_timestamp: String(now - 60),
        stop_timestamp: String(now + 3600),
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadXtreamShortEpg(playlist, ["101", "102"].map((providerId) => ({
      id: `xtream-1:live:${providerId}`,
      playlistId: playlist.id,
      providerId,
      name: `Channel ${providerId}`,
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
      tvgId: "news.demo",
    })));
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestUrl.searchParams.get("action")).toBe("get_short_epg");
    expect(requestUrl.searchParams.get("stream_id")).toBe("101");
    expect(requestUrl.searchParams.get("limit")).toBe("3");
    expect(result).toMatchObject({
      requestedChannels: 2,
      failedChannels: 0,
      programs: Array.from({ length: 2 }, () => expect.objectContaining({
        channelId: "news.demo",
        title: "Evening News",
        synopsis: "Top headlines.",
        source: playlist.id,
      })),
    });
    expect(new Set(result.programs.map((program) => program.id)).size).toBe(2);
  });

  it("reports partial short-guide failures without discarding successful channels", async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("stream_id") === "202") return new Response("Unavailable", { status: 503 });
      return new Response(JSON.stringify({
        epg_listings: [{
          title: "VGVzdCBQcm9ncmFtbWU=",
          start_timestamp: String(now - 60),
          stop_timestamp: String(now + 3600),
        }],
      }), { status: 200 });
    }));
    const channels = ["101", "202"].map((providerId) => ({
      id: `xtream-1:live:${providerId}`,
      playlistId: playlist.id,
      providerId,
      name: `Channel ${providerId}`,
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
    }));

    await expect(loadXtreamShortEpg(playlist, channels)).resolves.toMatchObject({
      requestedChannels: 2,
      failedChannels: 1,
      failureMessage: "Xtream short EPG failed with HTTP 503.",
      programs: [{ title: "Test Programme" }],
    });
  });

  it("limits short-guide request concurrency to four channels", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn(async () => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return new Response(JSON.stringify({ epg_listings: [] }), { status: 200 });
      } finally {
        activeRequests -= 1;
      }
    });
    vi.stubGlobal("fetch", fetchMock);
    const channels = Array.from({ length: 12 }, (_, index) => ({
      id: `xtream-1:live:${index}`,
      playlistId: playlist.id,
      providerId: String(index),
      name: `Channel ${index}`,
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
    }));

    await loadXtreamShortEpg(playlist, channels);

    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(maxActiveRequests).toBe(4);
  });

  it("rejects guide batches above the maximum page size before making requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const channels = Array.from({ length: 97 }, (_, index) => ({
      id: `xtream-1:live:${index}`,
      playlistId: playlist.id,
      providerId: String(index),
      name: `Channel ${index}`,
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
    }));

    await expect(loadXtreamShortEpg(playlist, channels)).rejects.toThrow(/no more than 96 channels/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
