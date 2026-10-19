import { describe, expect, it, vi } from "vitest";
import { fetchMdblistPopularCatalog, parseMdblistPopularCatalog } from "../providers/mdblistCatalog";
import type { MdblistRateLimiter } from "../mdblistRateLimit";

const noRateLimit: MdblistRateLimiter = {
  acquire: async () => () => undefined,
  recordResponse: async () => undefined,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("MDBList popular catalog provider", () => {
  it("parses TMDB popularity catalog items and IDs", () => {
    expect(parseMdblistPopularCatalog({
      movies: [
        { title: "Example Movie", year: 2024, ids: { imdbid: "tt1234567", tmdbid: 42 } },
        { title: "", year: 2020 },
        null,
      ],
    }, "MOVIE")).toEqual([
      { title: "Example Movie", year: 2024, imdbId: "tt1234567", tmdbId: "42" },
    ]);
  });

  it("requests the popular movies or shows endpoint and appends descriptions", async () => {
    const transport = vi.fn(async (_url: string) => json({
      shows: [{ title: "Example Show", year: 2023, ids: { tmdbid: 99 } }],
    }));
    await expect(fetchMdblistPopularCatalog("SERIES", "key-1", transport, noRateLimit))
      .resolves.toEqual([{ title: "Example Show", year: 2023, tmdbId: "99" }]);
    const url = new URL(transport.mock.calls[0][0]);
    expect(url.pathname).toBe("/catalog/show");
    expect(url.searchParams.get("sort")).toBe("tmdbpopular");
    expect(url.searchParams.get("sort_order")).toBe("desc");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("append_to_response")).toBe("poster,ratings,description");
    expect(url.searchParams.get("apikey")).toBe("key-1");
  });

  it("requires an API key and maps auth failures safely", async () => {
    const transport = vi.fn(async () => json({}, 401));
    await expect(fetchMdblistPopularCatalog("MOVIE", " ", transport, noRateLimit))
      .rejects.toMatchObject({ kind: "missing-key" });
    await expect(fetchMdblistPopularCatalog("MOVIE", "secret", transport, noRateLimit))
      .rejects.toMatchObject({ kind: "auth" });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("does not call MDBList when the shared quota guard is blocking requests", async () => {
    const transport = vi.fn(async (_url: string) => json({ movies: [] }));
    const rateLimiter: MdblistRateLimiter = {
      acquire: async () => { throw new Error("quota exhausted"); },
      recordResponse: async () => undefined,
    };
    await expect(fetchMdblistPopularCatalog("MOVIE", "key", transport, rateLimiter))
      .rejects.toThrow("quota exhausted");
    expect(transport).not.toHaveBeenCalled();
  });
});
