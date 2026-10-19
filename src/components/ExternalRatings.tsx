import { useEffect, useState } from "react";
import { MdblistError } from "../providers/mdblist";
import { createTitleIdentity } from "../ratings";
import type { RatingsService } from "../ratingsService";
import type { ExternalRating, Movie, RatingsMediaType, Series } from "../types";

type RatingsState =
  | { phase: "loading" }
  | { phase: "ready"; ratings: ExternalRating[]; refreshing: boolean; refreshFailed: boolean }
  | { phase: "not-found" }
  | { phase: "unmatched" }
  | { phase: "error"; message: string };

const SOURCE_LABELS: Record<string, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  trakt: "Trakt",
  letterboxd: "Letterboxd",
  tomatoes: "Rotten Tomatoes (critics)",
  tomatoesaudience: "Rotten Tomatoes (audience)",
  metacritic: "Metacritic",
  metacriticuser: "Metacritic (users)",
  popcorn: "Rotten Tomatoes (audience)",
  rogerebert: "RogerEbert.com",
  myanimelist: "MyAnimeList",
};

export function ratingSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRating(rating: ExternalRating): string {
  const main = rating.value !== undefined
    ? String(Math.round(rating.value * 10) / 10)
    : `${Math.round(rating.score ?? 0)}/100`;
  return rating.votes !== undefined ? `${main} · ${rating.votes.toLocaleString("en-US")} votes` : main;
}

export function ExternalRatingsPanel({
  item,
  mediaType,
  service,
}: {
  item: Movie | Series;
  mediaType: RatingsMediaType;
  service?: RatingsService;
}) {
  const { name, year, imdbId, tmdbId } = item;
  const [state, setState] = useState<RatingsState>({ phase: "loading" });

  useEffect(() => {
    if (!service) return;
    const identity = createTitleIdentity({ name, year, imdbId, tmdbId }, mediaType);
    if (!identity) {
      setState({ phase: "unmatched" });
      return;
    }
    const controller = new AbortController();
    setState({ phase: "loading" });
    void (async () => {
      try {
        const result = await service.getRatings(identity, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === "not-found") {
          setState({ phase: "not-found" });
          return;
        }
        const ratings = result.ratings?.ratings ?? [];
        setState({ phase: "ready", ratings, refreshing: Boolean(result.refresh), refreshFailed: false });
        if (result.refresh) {
          const refreshed = await result.refresh;
          if (controller.signal.aborted) return;
          setState(refreshed.refreshFailed
            ? { phase: "ready", ratings, refreshing: false, refreshFailed: true }
            : refreshed.status === "not-found"
              ? { phase: "not-found" }
              : {
                phase: "ready",
                ratings: refreshed.ratings?.ratings ?? [],
                refreshing: false,
                refreshFailed: false,
              });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          message: error instanceof MdblistError ? error.message : "External ratings are unavailable right now.",
        });
      }
    })();
    return () => controller.abort();
  }, [service, name, year, imdbId, tmdbId, mediaType]);

  if (!service) return null;
  return (
    <section aria-label="External ratings" className="external-ratings">
      {state.phase === "loading" && <p role="status">Loading external ratings…</p>}
      {state.phase === "unmatched" && <p>External ratings unavailable: this title has no year or ID to match safely.</p>}
      {state.phase === "not-found" && <p>No external ratings were found for this title.</p>}
      {state.phase === "error" && <p role="status">External ratings unavailable. {state.message}</p>}
      {state.phase === "ready" && (
        state.ratings.length === 0
          ? <p>No external ratings were found for this title.</p>
          : (
            <dl className="external-ratings-list">
              {state.ratings.map((rating) => (
                <div key={rating.source}>
                  <dt>{ratingSourceLabel(rating.source)}</dt>
                  <dd>{formatRating(rating)}</dd>
                </div>
              ))}
            </dl>
          )
      )}
      {state.phase === "ready" && state.refreshing && <p role="status">Refreshing saved ratings…</p>}
      {state.phase === "ready" && state.refreshFailed && <p role="status">Showing saved ratings; refresh failed.</p>}
      <p className="form-note">External ratings by MDBList. The rating above is from your source.</p>
    </section>
  );
}
