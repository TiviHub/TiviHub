// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { MovieDetail, SeriesDetail } from "../components/ContentPages";
import { MdblistError } from "../providers/mdblist";
import type { RatingsResult, RatingsService } from "../ratingsService";
import { saveCatalog, savePlaylist } from "../storage/database";
import type { Movie, Playlist, Series } from "../types";

const movie: Movie = {
  id: "p1:movie:1", playlistId: "p1", name: "Heat", year: 1995, rating: 7.1, imdbId: "tt0113277",
  streamUrl: "https://p.example/heat.mp4",
};
const series: Series = { id: "p1:series:1", playlistId: "p1", name: "Dark", year: 2017, rating: 8.0, seasons: 3 };

function service(getRatings: RatingsService["getRatings"]): RatingsService {
  return { getRatings };
}

const ratingsResult: RatingsResult = {
  status: "fresh",
  ratings: { ratings: [{ source: "imdb", value: 8.3, votes: 12345 }, { source: "tomatoes", score: 87 }] },
};

function renderMovie(ratingsService: RatingsService, onPlay = vi.fn()) {
  render(<MovieDetail
    continueWatching={false} favorite={false} inLibrary={false} movie={movie} onAddToLibrary={vi.fn()}
    onBack={vi.fn()} onFavorite={vi.fn()} onPlay={onPlay} onRemoveFromLibrary={vi.fn()} ratingsService={ratingsService}
  />);
  return onPlay;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("detail page external ratings", () => {
  it("shows loading, then source-labelled ratings next to the provider rating", async () => {
    let resolve!: (value: RatingsResult) => void;
    renderMovie(service(() => new Promise((done) => { resolve = done; })));
    expect(screen.getByText("Loading external ratings…")).toBeTruthy();
    expect(screen.getByText("★ 7.1")).toBeTruthy();
    resolve(ratingsResult);
    expect(await screen.findByText("IMDb")).toBeTruthy();
    expect(screen.getByText("8.3 · 12,345 votes")).toBeTruthy();
    expect(screen.getByText("Rotten Tomatoes (critics)")).toBeTruthy();
    expect(screen.getByText("87/100")).toBeTruthy();
    expect(screen.getByText("★ 7.1")).toBeTruthy();
  });

  it("keeps provider rating and playback usable when MDBList is unavailable", async () => {
    const onPlay = renderMovie(service(async () => { throw new MdblistError("server", "MDBList is temporarily unavailable."); }));
    expect(await screen.findByText(/External ratings unavailable\. MDBList is temporarily unavailable\./)).toBeTruthy();
    expect(screen.getByText("★ 7.1")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Watch movie/ }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("keeps playback usable while ratings are still loading", async () => {
    const onPlay = renderMovie(service(() => new Promise(() => undefined)));
    await userEvent.click(screen.getByRole("button", { name: /Watch movie/ }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("shows a missing-key hint and a not-found state", async () => {
    renderMovie(service(async () => { throw new MdblistError("missing-key", "Add an MDBList API key in Settings to load external ratings."); }));
    expect(await screen.findByText(/Add an MDBList API key in Settings/)).toBeTruthy();
    cleanup();
    renderMovie(service(async () => ({ status: "not-found" })));
    expect(await screen.findByText("No external ratings were found for this title.")).toBeTruthy();
  });

  it("shows stale ratings while refreshing and after a failed refresh", async () => {
    let finish!: (value: RatingsResult) => void;
    renderMovie(service(async () => ({
      ...ratingsResult,
      status: "stale",
      refresh: new Promise<RatingsResult>((done) => { finish = done; }),
    })));
    expect(await screen.findByText("Refreshing saved ratings…")).toBeTruthy();
    expect(screen.getByText("IMDb")).toBeTruthy();
    finish({ ...ratingsResult, status: "stale", refreshFailed: true });
    expect(await screen.findByText("Showing saved ratings; refresh failed.")).toBeTruthy();
    expect(screen.getByText("IMDb")).toBeTruthy();
  });

  it("does not guess when a title has no ID or year", async () => {
    const getRatings = vi.fn();
    render(<MovieDetail
      continueWatching={false} favorite={false} inLibrary={false} movie={{ ...movie, imdbId: undefined, year: undefined }}
      onAddToLibrary={vi.fn()} onBack={vi.fn()} onFavorite={vi.fn()} onPlay={vi.fn()} onRemoveFromLibrary={vi.fn()}
      ratingsService={service(getRatings)}
    />);
    expect(await screen.findByText(/no year or ID to match safely/)).toBeTruthy();
    expect(getRatings).not.toHaveBeenCalled();
  });

  it("requests series ratings with the series media type", async () => {
    const getRatings = vi.fn(async () => ratingsResult);
    render(<SeriesDetail
      continueWatching={false} episodes={[]} error={null} favorite={false} inLibrary={false} loading={false}
      onAddToLibrary={vi.fn()} onBack={vi.fn()} onContinueWatching={vi.fn()} onFavorite={vi.fn()} onPlay={vi.fn()}
      onRemoveFromLibrary={vi.fn()} series={series} showAdultContent={false} ratingsService={service(getRatings)}
    />);
    expect(await screen.findByText("IMDb")).toBeTruthy();
    expect(getRatings).toHaveBeenCalledWith(expect.objectContaining({ mediaType: "SERIES", key: expect.stringMatching(/^series:/) }), expect.anything());
  });
});

describe("startup", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
      matches: false, media, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(() => false),
    })));
  });

  it("does not fetch ratings for a large catalog when the app loads or browses movies", async () => {
    const fetchSpy = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    const playlist: Playlist = {
      id: "big", name: "Big", type: "M3U", url: "https://provider.example/p.m3u", username: "", password: "",
      active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
    };
    await savePlaylist(playlist);
    await saveCatalog({
      playlistId: "big",
      channels: [],
      series: [],
      movies: Array.from({ length: 2000 }, (_, index) => ({
        id: `big:movie:${index}`, playlistId: "big", name: `Movie ${index}`, year: 2000, imdbId: `tt${String(1000000 + index)}`,
        streamUrl: `https://provider.example/${index}.mp4`,
      })),
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());
    await userEvent.click(screen.getAllByRole("button", { name: "Movies" })[0]);
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();
    const mdblistCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("mdblist"));
    expect(mdblistCalls).toHaveLength(0);
  }, 30_000);
});
