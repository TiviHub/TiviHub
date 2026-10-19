// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "../components/ContentPages";
import type { PopularCatalogService } from "../popularCatalogService";
import type { MdblistPopularItem, RatingsMediaType } from "../types";
import type { Movie, Series } from "../types";

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
    guideLoading={false}
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
    guideLoading={false}
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
