import { Skeleton } from "./Skeleton";
import { useEffect, useState } from "react";
import { MdblistError } from "../providers/mdblist";
import { createTitleIdentity } from "../lib/ratings";
import type { RatingsService } from "../services/ratingsService";
import type { ExternalRating, Movie, RatingsMediaType, Series } from "../types";

type RatingsState =
  | { phase: "loading" }
  | { phase: "ready"; ratings: ExternalRating[]; overview?: string; refreshing: boolean; refreshFailed: boolean }
  | { phase: "not-found" }
  | { phase: "unmatched" }
  | { phase: "error"; message: string };

const SOURCE_LABELS: Record<string, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  tomatoes: "Rotten Tomatoes",
  metacritic: "Metacritic",
};

const PRIMARY_RATING_SOURCES = ["imdb", "tmdb", "tomatoes", "metacritic"] as const;

export function ratingSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRating(rating: ExternalRating): string {
  const score = rating.value ?? rating.score;
  if (score === undefined) return "";
  return rating.source === "tomatoes"
    ? `${Math.round(score)}%`
    : rating.source === "metacritic"
      ? `${Math.round(score)}/100`
      : rating.value !== undefined
        ? String(Math.round(rating.value * 10) / 10)
        : `${Math.round(rating.score ?? 0)}/100`;
}

function RatingLogo({ source }: { source: string }) {
  if (source === "tomatoes") {
    return (
      <span aria-hidden="true" className="external-rating-logo external-rating-logo-tomatoes">
        <svg viewBox="0 0 20 20">
          <path d="M10 5.5C5.4 2.2 2.1 6.1 2.6 10.6c.4 4 3.4 6.6 7.4 6.6s7-2.6 7.4-6.6C17.9 6.1 14.6 2.2 10 5.5Z" />
          <path d="M10 5.4 8 2.7l2.4 1 2.8-1.2-1.1 2.6 2.4.2-2.5 1.1-2-1.3-2.2 1L5 4.8l3.1.3L7 2.9Z" />
        </svg>
        RT
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`external-rating-logo external-rating-logo-${source}`}>
      {source === "metacritic" ? "M" : source === "imdb" ? "IMDb" : "TMDB"}
    </span>
  );
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
        const overview = result.ratings?.overview;
        setState({ phase: "ready", ratings, overview, refreshing: Boolean(result.refresh), refreshFailed: false });
        if (result.refresh) {
          const refreshed = await result.refresh;
          if (controller.signal.aborted) return;
          setState(refreshed.refreshFailed
            ? { phase: "ready", ratings, overview, refreshing: false, refreshFailed: true }
            : refreshed.status === "not-found"
              ? { phase: "not-found" }
              : {
                phase: "ready",
                ratings: refreshed.ratings?.ratings ?? [],
                overview: refreshed.ratings?.overview,
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
  const hasPlaylistOverview = Boolean(item.overview?.trim());
  const displayedRatings = state.phase === "ready"
    ? PRIMARY_RATING_SOURCES.flatMap((source) => {
      const rating = state.ratings.find((entry) => entry.source === source);
      return rating ? [rating] : [];
    })
    : [];
  return (
    <section aria-label="External ratings" className="external-ratings">
      {!hasPlaylistOverview && state.phase === "ready" && state.overview && (
        <p className="external-ratings-overview">{state.overview}</p>
      )}
      {state.phase === "loading" && (
        <div role="status">
          <span className="sr-only">Loading external ratings…</span>
          <div aria-hidden="true" className="skeleton-ratings">
            {[0, 1, 2].map((index) => <Skeleton className="skeleton-rating" key={index} />)}
          </div>
        </div>
      )}
      {state.phase === "unmatched" && <p>External ratings unavailable: this title has no year or ID to match safely.</p>}
      {state.phase === "not-found" && <p>No external ratings were found for this title.</p>}
      {state.phase === "error" && <p role="status">External ratings unavailable. {state.message}</p>}
      {state.phase === "ready" && (
        displayedRatings.length === 0
          ? <p>No external ratings were found for this title.</p>
          : (
            <dl className="external-ratings-list">
              {displayedRatings.map((rating) => (
                <div
                  aria-label={`${ratingSourceLabel(rating.source)} ${formatRating(rating)}`}
                  className={`external-rating-badge external-rating-${rating.source}`}
                  key={rating.source}
                >
                  <dt><RatingLogo source={rating.source} /></dt>
                  <dd>{formatRating(rating)}</dd>
                </div>
              ))}
            </dl>
          )
      )}
      {state.phase === "ready" && state.refreshing && <p role="status">Refreshing saved ratings…</p>}
      {state.phase === "ready" && state.refreshFailed && <p role="status">Showing saved ratings; refresh failed.</p>}
    </section>
  );
}
