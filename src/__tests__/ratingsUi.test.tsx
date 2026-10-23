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
  ratings: {
    overview: "A summary supplied by MDBList.",
    ratings: [
      { source: "imdb", value: 8.3, votes: 12345 },
      { source: "tomatoes", score: 87 },
      { source: "tmdb", value: 7.6 },
      { source: "metacritic", score: 68 },
      { source: "trakt", value: 7.9 },
      { source: "popcorn", score: 91 },
    ],
  },
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
  it("shows playable movies from the same playlist and opens the selected title", async () => {
    const onOpenMovie = vi.fn();
    const related = {
      ...movie,
      id: "p1:movie:2",
      name: "Arrival",
      posterUrl: "https://images.example/arrival.jpg",
    };
    render(<MovieDetail
      continueWatching={false}
      favorite={false}
      inLibrary={false}
      movie={{ ...movie, posterUrl: "https://images.example/heat.jpg" }}
      onAddToLibrary={vi.fn()}
      onBack={vi.fn()}
      onFavorite={vi.fn()}
      onOpenMovie={onOpenMovie}
      onToggleRelatedFavorite={vi.fn()}
      onAddRelatedToLibrary={vi.fn()}
      onPlay={vi.fn()}
      onRemoveFromLibrary={vi.fn()}
      playlistMovies={[
        related,
        ...Array.from({ length: 8 }, (_, index) => ({
          ...related,
          id: `p1:movie:${index + 3}`,
          name: `Related ${index + 1}`,
        })),
        { ...related, id: "p2:movie:1", playlistId: "p2", name: "Other playlist movie" },
      ]}
      ratingsService={service(async () => ({ status: "not-found" }))}
    />);
    expect(document.querySelector(".series-detail-header .detail-backdrop")?.getAttribute("src")).toBe("https://images.example/heat.jpg");
    expect(screen.getByText("More from this playlist")).toBeTruthy();
    expect(document.querySelector(".detail-more-heading > span")).toBeNull();
    expect(screen.queryByText("Other playlist movie")).toBeNull();
    expect(document.querySelectorAll(".detail-more-card")).toHaveLength(9);
    expect(document.querySelector(".detail-more-artwork.catalog-artwork .catalog-artwork-fallback")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Arrival to favorites" }).getAttribute("data-tooltip"))
      .toBe("Add Movie to favorites");
    expect(screen.getByRole("button", { name: "Add Arrival to your watchlist" }).getAttribute("data-tooltip"))
      .toBe("Add to watchlist");
    expect(screen.getByRole("button", { name: "Add to watchlist" }).getAttribute("data-tooltip"))
      .toBe("Add to watchlist");
    await userEvent.click(screen.getByRole("button", { name: "View details for Arrival" }));
    expect(onOpenMovie).toHaveBeenCalledWith(related);
  });

  it("shows and opens related series from the same playlist", async () => {
    const onOpenSeries = vi.fn();
    const related = { ...series, id: "p1:series:2", name: "The Wire" };
    render(<SeriesDetail
      continueWatching={false}
      episodes={[]}
      error={null}
      favorite={false}
      inLibrary={false}
      loading={false}
      onAddToLibrary={vi.fn()}
      onBack={vi.fn()}
      onContinueWatching={vi.fn()}
      onFavorite={vi.fn()}
      onOpenSeries={onOpenSeries}
      onToggleRelatedFavorite={vi.fn()}
      onAddRelatedToLibrary={vi.fn()}
      onPlay={vi.fn()}
      onRemoveFromLibrary={vi.fn()}
      playlistSeries={[related]}
      series={{ ...series, posterUrl: "https://images.example/dark.jpg" }}
      showAdultContent={false}
      ratingsService={service(async () => ({ status: "not-found" }))}
    />);
    expect(document.querySelector(".series-detail-header .detail-backdrop")?.getAttribute("src")).toBe("https://images.example/dark.jpg");
    expect(
      screen.getByRole("heading", { name: "Episodes" }).compareDocumentPosition(screen.getByText("More from this playlist")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add The Wire to favorites" }).getAttribute("data-tooltip"))
      .toBe("Add Series to favorites");
    expect(screen.getByRole("button", { name: "Add The Wire to your watchlist" }).getAttribute("data-tooltip"))
      .toBe("Add to watchlist");
    await userEvent.click(screen.getByRole("button", { name: "View details for The Wire" }));
    expect(onOpenSeries).toHaveBeenCalledWith(related);
  });

  it("starts Play first episode at the first real season, not at season 0 extras", async () => {
    const onPlay = vi.fn();
    render(<SeriesDetail
      continueWatching={false}
      episodes={[
        { id: "extra", playlistId: "p1", seriesId: series.id, season: 0, number: 1, name: "Behind the scenes", streamUrl: "https://p.example/0.mp4" },
        { id: "episode-1", playlistId: "p1", seriesId: series.id, season: 1, number: 1, name: "Pilot", streamUrl: "https://p.example/1.mp4" },
      ]}
      error={null}
      favorite={false}
      inLibrary={false}
      loading={false}
      onAddToLibrary={vi.fn()}
      onBack={vi.fn()}
      onContinueWatching={vi.fn()}
      onFavorite={vi.fn()}
      onDownload={vi.fn()}
      onPlay={onPlay}
      onRemoveFromLibrary={vi.fn()}
      series={series}
      showAdultContent={false}
      ratingsService={service(async () => ({ status: "not-found" }))}
    />);

    await userEvent.click(screen.getByRole("button", { name: /Play first episode/ }));

    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Pilot") }));
  });

  it("defaults the episode list to season 1 while retaining the all-seasons option", async () => {
    render(<SeriesDetail
      continueWatching={false}
      episodes={[
        { id: "episode-1", playlistId: "p1", seriesId: series.id, season: 1, number: 1, name: "Pilot", streamUrl: "https://p.example/1.mp4" },
        { id: "episode-2", playlistId: "p1", seriesId: series.id, season: 2, number: 1, name: "New Chapter", streamUrl: "https://p.example/2.mp4" },
      ]}
      error={null}
      favorite={false}
      inLibrary={false}
      loading={false}
      onAddToLibrary={vi.fn()}
      onBack={vi.fn()}
      onContinueWatching={vi.fn()}
      onFavorite={vi.fn()}
      onDownload={vi.fn()}
      onPlay={vi.fn()}
      onRemoveFromLibrary={vi.fn()}
      series={series}
      showAdultContent={false}
      ratingsService={service(async () => ({ status: "not-found" }))}
    />);

    expect(screen.getByText(/S01 E01 · Pilot/)).toBeTruthy();
    expect(screen.queryByText(/S02 E01 · New Chapter/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter season" }).textContent).toContain("Season 1");
    expect(screen.getByText("SERIES DETAILS / 2 SEASONS / 2 EPISODES")).toBeTruthy();
    expect(document.querySelector(".episode-row")?.getAttribute("data-tooltip-placement")).toBe("bottom");
    expect(document.querySelector(".episode-download-action")?.getAttribute("data-tooltip"))
      .toBe("Download for offline playback");
    expect(document.querySelector(".episode-download-action")?.getAttribute("data-tooltip-placement")).toBe("left");
    await userEvent.click(screen.getByRole("combobox", { name: "Filter season" }));
    await userEvent.click(await screen.findByRole("option", { name: "All seasons" }));
    expect(screen.getByText(/S02 E01 · New Chapter/)).toBeTruthy();
  });

  it("shows loading, then source-labelled ratings next to the provider rating", async () => {
    let resolve!: (value: RatingsResult) => void;
    renderMovie(service(() => new Promise((done) => { resolve = done; })));
    expect(screen.getByText("Loading external ratings…")).toBeTruthy();
    expect(screen.getByText("★ 7.1")).toBeTruthy();
    resolve(ratingsResult);
    expect(await screen.findByText("IMDb")).toBeTruthy();
    expect(screen.getByText("8.3")).toBeTruthy();
    expect(document.querySelector('[aria-label="Rotten Tomatoes 87%"]')).toBeTruthy();
    expect(screen.getByText("87%")).toBeTruthy();
    expect(screen.getByText("TMDB")).toBeTruthy();
    expect(screen.getByText("7.6")).toBeTruthy();
    expect(document.querySelector('[aria-label="Metacritic 68/100"]')).toBeTruthy();
    expect(screen.getByText("68/100")).toBeTruthy();
    expect(screen.queryByText("Trakt")).toBeNull();
    expect(screen.queryByText("Rotten Tomatoes (audience)")).toBeNull();
    expect(screen.getByText("A summary supplied by MDBList.")).toBeTruthy();
    expect(screen.queryByText(/votes/)).toBeNull();
    expect(screen.queryByText(/External ratings by MDBList/)).toBeNull();
    expect(document.querySelectorAll(".external-rating-badge")).toHaveLength(4);
    expect(screen.getByText("★ 7.1")).toBeTruthy();
  });

  it("prefers the playlist summary over an MDBList summary", async () => {
    render(<MovieDetail
      continueWatching={false}
      favorite={false}
      inLibrary={false}
      movie={{ ...movie, overview: "Playlist-provided summary." }}
      onAddToLibrary={vi.fn()}
      onBack={vi.fn()}
      onFavorite={vi.fn()}
      onPlay={vi.fn()}
      onRemoveFromLibrary={vi.fn()}
      ratingsService={service(async () => ratingsResult)}
    />);
    expect(await screen.findByText("IMDb")).toBeTruthy();
    expect(screen.getByText("Playlist-provided summary.")).toBeTruthy();
    expect(screen.queryByText("A summary supplied by MDBList.")).toBeNull();
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
