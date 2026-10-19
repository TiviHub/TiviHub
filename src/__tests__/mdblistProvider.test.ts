import { describe, expect, it, vi } from "vitest";
import { fetchMdblistRatings, MdblistError, parseMdblistRatings, type MdblistTransport } from "../providers/mdblist";
import { createTitleIdentity } from "../ratings";

const SECRET = "test-key-123";
const movie = createTitleIdentity({ name: "Heat", year: 1995, imdbId: "tt0113277" }, "MOVIE")!;
const series = createTitleIdentity({ name: "Dark", year: 2017, tmdbId: "70523" }, "SERIES")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const validBody = {
  ids: { imdb: "tt0113277", tmdb: 949 },
  ratings: [
    { source: "imdb", value: 8.3, score: 83, votes: 700000 },
    { source: "tomatoes", value: null, score: 87, votes: null },
    { source: "bad", value: "x" },
    { source: "imdb", value: 1 },
    "junk",
  ],
};

async function failure(transport: MdblistTransport, key = SECRET, identity = movie) {
  return fetchMdblistRatings(identity, key, undefined, transport).catch((error: unknown) => error);
}

describe("MDBList provider", () => {
  it("parses valid responses and drops invalid rating rows", async () => {
    const transport = vi.fn<MdblistTransport>(async () => json(validBody));
    const result = await fetchMdblistRatings(movie, SECRET, undefined, transport);
    expect(result).toEqual({
      ids: { imdb: "tt0113277", tmdb: "949" },
      ratings: [
        { source: "imdb", value: 8.3, score: 83, votes: 700000 },
        { source: "tomatoes", score: 87 },
      ],
    });
    const url = new URL(transport.mock.calls[0][0].url);
    expect(url.origin + url.pathname).toBe("https://api.mdblist.com/imdb/movie/tt0113277");
    expect(url.searchParams.get("apikey")).toBe(SECRET);
  });

  it("uses the show path for series and TMDB IDs", async () => {
    const transport = vi.fn<MdblistTransport>(async () => json({ ratings: [] }));
    await expect(fetchMdblistRatings(series, SECRET, undefined, transport)).resolves.toEqual({ ratings: [] });
    expect(new URL(transport.mock.calls[0][0].url).pathname).toBe("/tmdb/show/70523");
  });

  it("tolerates missing optional fields", () => {
    expect(parseMdblistRatings({ ratings: [{ source: "imdb", score: 50 }] }))
      .toEqual({ ratings: [{ source: "imdb", score: 50 }] });
  });

  it.each([null, "x", [], {}, { ratings: "no" }])("rejects malformed payload %j", (payload) => {
    expect(() => parseMdblistRatings(payload)).toThrow(MdblistError);
  });

  it("rejects invalid JSON and error bodies", async () => {
    expect(await failure(async () => new Response("<html>", { status: 200 })))
      .toMatchObject({ kind: "invalid-response" });
    expect(await failure(async () => json({ error: "Something odd" }))).toMatchObject({ kind: "invalid-response" });
  });

  it("returns null for 404 and not-found bodies", async () => {
    await expect(fetchMdblistRatings(movie, SECRET, undefined, async () => json({}, 404))).resolves.toBeNull();
    await expect(fetchMdblistRatings(movie, SECRET, undefined, async () => json({ error: "Not found" })))
      .resolves.toBeNull();
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate-limited"],
    [500, "server"],
    [503, "server"],
    [418, "invalid-response"],
  ])("maps HTTP %i to %s without leaking the key", async (status, kind) => {
    const error = await failure(async () => json({}, status));
    expect(error).toBeInstanceOf(MdblistError);
    expect(error).toMatchObject({ kind, status });
    expect((error as Error).message).not.toContain(SECRET);
  });

  it("maps network errors to a safe message", async () => {
    const error = await failure(async () => {
      throw new TypeError(`Failed to fetch https://api.mdblist.com/?apikey=${SECRET}`);
    });
    expect(error).toMatchObject({ kind: "network" });
    expect((error as Error).message).not.toContain(SECRET);
  });

  it("requires an API key and makes no request without one", async () => {
    const transport = vi.fn<MdblistTransport>();
    expect(await failure(transport, "  ")).toMatchObject({ kind: "missing-key" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    const transport: MdblistTransport = ({ signal }) => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const pending = fetchMdblistRatings(movie, SECRET, controller.signal, transport);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("matches ID-less titles only on an exact unambiguous search result", async () => {
    const byTitle = createTitleIdentity({ name: "Heat", year: 1995 }, "MOVIE")!;
    const transport = vi.fn<MdblistTransport>(async ({ url }) =>
      new URL(url).pathname.startsWith("/search")
        ? json({ search: [{ title: "Heat", year: 1995, ids: { imdb: "tt0113277" } }, { title: "Heat", year: 1986, ids: { imdb: "tt0091187" } }] })
        : json(validBody));
    await expect(fetchMdblistRatings(byTitle, SECRET, undefined, transport)).resolves.toMatchObject({ ratings: expect.any(Array) });
    expect(transport).toHaveBeenCalledTimes(2);

    const ambiguous = vi.fn<MdblistTransport>(async () =>
      json({ search: [{ title: "Heat", year: 1995, ids: { imdb: "tt0113277" } }, { title: "HEAT", year: 1995, ids: { imdb: "tt0000001" } }] }));
    await expect(fetchMdblistRatings(byTitle, SECRET, undefined, ambiguous)).resolves.toBeNull();
    expect(ambiguous).toHaveBeenCalledTimes(1);
  });
});

describe("title identity", () => {
  it("prefers IMDb, then TMDB, then year-qualified normalized titles", () => {
    expect(createTitleIdentity({ name: "X", imdbId: "TT0113277", tmdbId: "5" }, "MOVIE")?.key).toBe("movie:imdb:tt0113277");
    expect(createTitleIdentity({ name: "X", tmdbId: "5" }, "MOVIE")?.key).toBe("movie:tmdb:5");
    expect(createTitleIdentity({ name: " Amélie: The  Film! ", year: 2001 }, "MOVIE")?.key)
      .toBe("movie:title:amelie the film:2001");
  });

  it("refuses to guess without IDs or a year", () => {
    expect(createTitleIdentity({ name: "Heat" }, "MOVIE")).toBeNull();
    expect(createTitleIdentity({ name: "!!!", year: 2000 }, "MOVIE")).toBeNull();
  });

  it("separates movies from series and ignores playlist IDs", () => {
    const a = createTitleIdentity({ name: "Fargo", year: 1996 }, "MOVIE")!;
    const b = createTitleIdentity({ name: "Fargo", year: 1996 }, "SERIES")!;
    expect(a.key).not.toBe(b.key);
  });
});
