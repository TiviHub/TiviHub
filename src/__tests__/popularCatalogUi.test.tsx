// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "../components/ContentPages";
import type { PopularCatalogService } from "../services/popularCatalogService";
import type { MdblistPopularItem, RatingsMediaType } from "../types";
import type { LiveChannel, Movie, Series } from "../types";

const movie: Movie = {
  id: "local-movie",
  playlistId: "playlist",
  name: "Local Batman Movie",
  year: 2020,
  tmdbId: "42",
  addedAtMillis: 1,
  streamUrl: "https://provider.example/movie",
};

afterEach(cleanup);

function renderCatalog(mdblistApiKey = "", service?: PopularCatalogService) {
  const onOpenMovie = vi.fn();
  render(<CatalogPage
    channels={[]}
    epg={[]}
    favorites={[]}
    library={[]}
    loading={false}
    movies={[movie]}
    onAddToLibrary={vi.fn()}
    onLoadGuideForChannels={vi.fn()}
    onOpenMovie={onOpenMovie}
    onOpenSeries={vi.fn()}
    onPlay={vi.fn()}
    onToggleFavorite={vi.fn()}
    section="Movies"
    series={[]}
    mdblistApiKey={mdblistApiKey}
    popularCatalogService={service}
  />);
  return onOpenMovie;
}

function renderSeriesCatalog(series: Series[]) {
  render(<CatalogPage
    channels={[]}
    epg={[]}
    favorites={[]}
    library={[]}
    loading={false}
    movies={[]}
    onAddToLibrary={vi.fn()}
    onLoadGuideForChannels={vi.fn()}
    onOpenMovie={vi.fn()}
    onOpenSeries={vi.fn()}
    onPlay={vi.fn()}
    onToggleFavorite={vi.fn()}
    section="Series"
    series={series}
  />);
}

describe("popular catalog UI", () => {
  it("uses generic favorite tooltip labels for channels, movies, and series", () => {
    const channel: LiveChannel = {
      id: "channel-1",
      playlistId: "playlist",
      name: "Local News",
      group: "News",
      streamUrl: "https://provider.example/live",
    };
    render(<CatalogPage
      channels={[channel]}
      epg={[]}
      favorites={[]}
      library={[]}
      loading={false}
      movies={[]}
      onAddToLibrary={vi.fn()}
      onLoadGuideForChannels={vi.fn()}
      onOpenMovie={vi.fn()}
      onOpenSeries={vi.fn()}
      onPlay={vi.fn()}
      onToggleFavorite={vi.fn()}
      section="Live TV"
      series={[]}
    />);
    expect(screen.getByRole("button", { name: "Add Local News to favorites" }).getAttribute("data-tooltip"))
      .toBe("Add TV Channel to favorites");

    cleanup();
    renderCatalog();
    expect(screen.getAllByRole("button", { name: "Add Local Batman Movie to favorites" })[0].getAttribute("data-tooltip"))
      .toBe("Add Movie to favorites");
    expect(screen.getAllByRole("button", { name: "Add Local Batman Movie to your watchlist" })[0].getAttribute("data-tooltip"))
      .toBe("Add to watchlist");

    cleanup();
    renderSeriesCatalog([{ id: "series-1", playlistId: "playlist", name: "Local Mystery", seasons: 1 }]);
    expect(screen.getByRole("button", { name: "Add Local Mystery to favorites" }).getAttribute("data-tooltip"))
      .toBe("Add Series to favorites");
    expect(screen.getByRole("button", { name: "Add Local Mystery to your watchlist" }).getAttribute("data-tooltip"))
      .toBe("Add to watchlist");
  });

  it("hides unknown zero-season counts while preserving known counts", () => {
    renderSeriesCatalog([
      { id: "unknown", playlistId: "playlist", name: "Unknown Seasons", seasons: 0 },
      { id: "known", playlistId: "playlist", name: "Known Seasons", seasons: 4 },
    ]);

    expect(screen.queryByText("0 seasons")).toBeNull();
    expect(screen.getAllByText("4 seasons").length).toBeGreaterThan(0);
  });

  it("shows popular local titles instead of recently added when an API key is configured", async () => {
    const getPopularCatalog = vi.fn(async (_mediaType: RatingsMediaType, _apiKey: string): Promise<MdblistPopularItem[]> => [
      { title: "Popular Batman", year: 2020, tmdbId: "42" },
    ]);
    const onOpenMovie = renderCatalog("saved-key", { getPopularCatalog });

    expect(await screen.findByRole("heading", { name: "Popular on TMDB" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Top 5 · Recently added" })).toBeNull();
    const movieCards = screen.getAllByRole("button", { name: "View details for Local Batman Movie" });
    expect(movieCards.length).toBeGreaterThan(0);
    expect(getPopularCatalog).toHaveBeenCalledOnce();
    movieCards[0].click();
    expect(onOpenMovie).toHaveBeenCalledWith(movie);
  });

  it("keeps the recently-added panel when no MDBList key is configured", async () => {
    renderCatalog();
    expect(await screen.findByRole("heading", { name: "Top 5 · Recently added" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Popular on TMDB" })).toBeNull();
  });

  it("falls back to recently added when MDBList returns zero titles", async () => {
    const getPopularCatalog = vi.fn(async (_mediaType: RatingsMediaType, _apiKey: string): Promise<MdblistPopularItem[]> => []);
    renderCatalog("saved-key", { getPopularCatalog });

    expect(await screen.findByRole("heading", { name: "Top 5 · Recently added" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Popular on TMDB" })).toBeNull();
  });

  it("reports a popular-feed failure and falls back to recently added", async () => {
    const getPopularCatalog = vi.fn(async (_mediaType: RatingsMediaType, _apiKey: string): Promise<MdblistPopularItem[]> => {
      throw new Error("offline");
    });
    renderCatalog("saved-key", { getPopularCatalog });

    expect(await screen.findByText("MDBList popular titles are unavailable. Showing recently added instead.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Top 5 · Recently added" })).toBeTruthy();
  });
});
