import { RowSkeletons } from "./Skeleton";
import { ExternalRatingsPanel } from "./ExternalRatings";
import type { RatingsService } from "../services/ratingsService";
import { useState } from "react";
import { isAdultContent } from "../lib/adultContent";
import type { Episode, Movie, PlayableItem, Series } from "../types";
import {
  canDownloadMedia,
  downloadIdFor,
  type DownloadableMedia,
} from "../services/downloads";
import { sortCatalogItems } from "../lib/catalogSorting";
import { CustomSelect, Icon } from "./common";


function relatedPlaylistItems<T extends Movie | Series>(selected: T, items: T[]): T[] {
  const candidates = items.filter((item) =>
    item.id !== selected.id && item.playlistId === selected.playlistId,
  );
  const category = selected.category?.trim().toLocaleLowerCase();
  const sameCategory = category
    ? candidates.filter((item) => item.category?.trim().toLocaleLowerCase() === category)
    : [];
  return sortCatalogItems(sameCategory.length > 0 ? sameCategory : candidates, "added").slice(0, 9);
}

function MoreFromPlaylist<T extends Movie | Series>({
  items,
  section,
  onSelect,
  favoriteIds = new Set(),
  libraryIds = new Set(),
  onToggleFavorite,
  onAddToLibrary,
}: {
  items: T[];
  section: "Movies" | "Series";
  onSelect: (item: T) => void;
  favoriteIds?: ReadonlySet<string>;
  libraryIds?: ReadonlySet<string>;
  onToggleFavorite?: (item: T) => void;
  onAddToLibrary?: (item: T) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="More from this playlist" className="detail-more-playlist">
      <div className="detail-more-heading">
        <div>
          <p className="eyebrow">KEEP EXPLORING</p>
          <h2>More from this playlist</h2>
        </div>
      </div>
      <div className="detail-more-rail">
        {items.map((item) => (
          <article className="catalog-card detail-more-card" key={item.id}>
            <button
              aria-label={`View details for ${item.name}`}
              className="catalog-card-main"
              data-tooltip={`View details for ${item.name}`}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="catalog-artwork detail-more-artwork">
                <span className="catalog-artwork-fallback">
                  <Icon name={section === "Movies" ? "movie" : "tv"} />
                </span>
                {item.posterUrl && (
                  <img
                    alt=""
                    loading="lazy"
                    onError={(event) => { event.currentTarget.hidden = true; }}
                    src={item.posterUrl}
                  />
                )}
              </span>
              <span className="catalog-card-copy">
                <strong data-tooltip={item.name}>{item.name}</strong>
                <small>
                  {[item.year, item.rating !== undefined ? `★ ${item.rating.toFixed(1)}` : undefined]
                    .filter((value) => value !== undefined)
                    .join(" · ") || item.category || section}
                </small>
              </span>
            </button>
            {onToggleFavorite && (
              <button
                aria-label={favoriteIds.has(item.id) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
                aria-pressed={favoriteIds.has(item.id)}
                className={`favorite-button${favoriteIds.has(item.id) ? " selected" : ""}`}
                data-tooltip={`${favoriteIds.has(item.id) ? "Remove" : "Add"} ${section === "Movies" ? "Movie" : "Series"} ${favoriteIds.has(item.id) ? "from" : "to"} favorites`}
                data-tooltip-placement="bottom"
                onClick={() => onToggleFavorite(item)}
                type="button"
              >
                <Icon name={favoriteIds.has(item.id) ? "favorite" : "favorite_border"} />
              </button>
            )}
            {onAddToLibrary && (
              <button
                aria-label={libraryIds.has(item.id) ? `${item.name} is saved in your library` : `Add ${item.name} to your watchlist`}
                aria-pressed={libraryIds.has(item.id)}
                className={`catalog-library-button${libraryIds.has(item.id) ? " selected" : ""}`}
                data-tooltip={libraryIds.has(item.id) ? "Already in your library" : "Add to watchlist"}
                data-tooltip-placement="bottom"
                disabled={libraryIds.has(item.id)}
                onClick={() => onAddToLibrary(item)}
                type="button"
              >
                <Icon name={libraryIds.has(item.id) ? "check" : "library_add"} />
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function OfflineDownloadAction({
  media,
  downloadedIds,
  activeDownloadIds,
  onDownload,
  compact = false,
  iconOnly = false,
}: {
  media: DownloadableMedia;
  downloadedIds: ReadonlySet<string>;
  activeDownloadIds: ReadonlySet<string>;
  onDownload: (media: DownloadableMedia) => void;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const id = downloadIdFor(media);
  const downloaded = downloadedIds.has(id);
  const downloading = activeDownloadIds.has(id);
  const supported = canDownloadMedia(media);
  const label = downloaded ? "Downloaded" : downloading ? "Downloading…" : "Download";
  return (
    <button
      aria-label={`${label} ${media.title}`}
      className={iconOnly ? "detail-icon-button" : compact ? "icon-button episode-download-action" : "secondary-button download-action"}
      disabled={!supported || downloaded || downloading}
      onClick={() => onDownload(media)}
      data-tooltip={!supported
        ? "Only direct, non-DRM video files can be saved offline."
        : downloaded ? "Already saved for offline playback" : downloading ? "Download in progress" : "Download for offline playback"}
      data-tooltip-placement={compact ? "left" : undefined}
      type="button"
    >
      <Icon name={downloaded ? "check" : downloading ? "downloading" : "download"} />
      {!compact && !iconOnly && label}
    </button>
  );
}

export function MovieDetail({
  movie,
  playlistMovies = [],
  favorite,
  inLibrary,
  continueWatching,
  onBack,
  onPlay,
  onFavorite,
  onAddToLibrary,
  onRemoveFromLibrary,
  onDownload,
  downloadedIds = new Set(),
  activeDownloadIds = new Set(),
  ratingsService,
  onOpenMovie,
  relatedFavoriteIds = new Set(),
  relatedLibraryIds = new Set(),
  onToggleRelatedFavorite,
  onAddRelatedToLibrary,
}: {
  ratingsService?: RatingsService;
  movie: Movie;
  relatedFavoriteIds?: ReadonlySet<string>;
  relatedLibraryIds?: ReadonlySet<string>;
  onToggleRelatedFavorite?: (movie: Movie) => void;
  onAddRelatedToLibrary?: (movie: Movie) => void;
  playlistMovies?: Movie[];
  favorite: boolean;
  inLibrary: boolean;
  continueWatching: boolean;
  onBack: () => void;
  onPlay: () => void;
  onFavorite: () => void;
  onAddToLibrary: () => void;
  onRemoveFromLibrary: () => void;
  onDownload?: (media: DownloadableMedia) => void;
  downloadedIds?: ReadonlySet<string>;
  activeDownloadIds?: ReadonlySet<string>;
  onOpenMovie?: (movie: Movie) => void;
}) {
  const relatedMovies = relatedPlaylistItems(movie, playlistMovies);
  return (
    <section className="series-detail-page">
      <button className="back-button" data-tooltip="Back to Movies overview" onClick={onBack} type="button"><Icon name="arrow_back" /> Movies</button>
      <header className="series-detail-header">
        {movie.posterUrl && <img alt="" aria-hidden="true" className="detail-backdrop" src={movie.posterUrl} />}
        <div>
          <p className="eyebrow">MOVIE DETAILS{movie.year ? ` / ${movie.year}` : ""}</p>
          <h1>{movie.name}</h1>
          <div className="detail-meta">
            <span>{movie.rating !== undefined ? `★ ${movie.rating.toFixed(1)}` : "No rating"}</span>
            {movie.category && <span>{movie.category}</span>}
          </div>
          {movie.overview?.trim() && <p>{movie.overview}</p>}
          <ExternalRatingsPanel item={movie} mediaType="MOVIE" service={ratingsService} />
          <div className="movie-detail-actions">
            <button className="primary-button" onClick={onPlay} type="button">
              <Icon name="play_arrow" /> {continueWatching ? "Continue watching" : "Watch movie"}
            </button>
            <button
              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={favorite}
              className={`detail-icon-button favorite${favorite ? " selected" : ""}`}
              data-tooltip={favorite ? "Remove from favorites" : "Add to favorites"}
              onClick={onFavorite}
              type="button"
            >
              <Icon name={favorite ? "favorite" : "favorite_border"} />
            </button>
            <button
              aria-label={inLibrary ? "Remove from library" : "Add to watchlist"}
              aria-pressed={inLibrary}
              className={`detail-icon-button${inLibrary ? " selected" : ""}`}
              data-tooltip={inLibrary ? "Remove from library" : "Add to watchlist"}
              onClick={inLibrary ? onRemoveFromLibrary : onAddToLibrary}
              type="button"
            >
              <Icon name={inLibrary ? "check" : "library_add"} />
            </button>
            {onDownload && (
              <OfflineDownloadAction
                activeDownloadIds={activeDownloadIds}
                downloadedIds={downloadedIds}
                iconOnly
                media={{
                  id: movie.id,
                  playlistId: movie.playlistId,
                  contentType: "MOVIE",
                  title: movie.name,
                  streamUrl: movie.streamUrl,
                  artworkUrl: movie.posterUrl,
                  drmLicenseUrl: movie.drmLicenseUrl,
                  drmSystem: movie.drmSystem,
                }}
                onDownload={onDownload}
              />
            )}
          </div>
        </div>
      </header>
      {onOpenMovie && (
        <MoreFromPlaylist
      favoriteIds={relatedFavoriteIds}
      libraryIds={relatedLibraryIds}
      items={relatedMovies}
      onAddToLibrary={onAddRelatedToLibrary}
      onToggleFavorite={onToggleRelatedFavorite}
      onSelect={onOpenMovie}
      section="Movies"
        />
      )}
    </section>
  );
}

function playableEpisode(series: Series, episode: Episode): PlayableItem {
  return {
    id: episode.id,
    playlistId: episode.playlistId,
    contentType: "EPISODE",
    title: `${series.name} · S${episode.season} E${episode.number} · ${episode.name}`,
    streamUrl: episode.streamUrl,
    artworkUrl: episode.posterUrl || series.posterUrl,
    drmLicenseUrl: episode.drmLicenseUrl,
    drmSystem: episode.drmSystem,
    live: false,
    parentId: series.id,
    parentTitle: series.name,
  };
}

export function SeriesDetail({
  series,
  episodes,
  showAdultContent,
  loading,
  error,
  onBack,
  onPlay,
  onFavorite,
  favorite,
  inLibrary,
  continueWatching,
  onContinueWatching,
  onAddToLibrary,
  onRemoveFromLibrary,
  ratingsService,
  playlistSeries = [],
  onOpenSeries,
  onDownload,
  downloadedIds = new Set(),
  activeDownloadIds = new Set(),
  relatedFavoriteIds = new Set(),
  relatedLibraryIds = new Set(),
  onToggleRelatedFavorite,
  onAddRelatedToLibrary,
}: {
  ratingsService?: RatingsService;
  playlistSeries?: Series[];
  onOpenSeries?: (series: Series) => void;
  onDownload?: (media: DownloadableMedia) => void;
  downloadedIds?: ReadonlySet<string>;
  activeDownloadIds?: ReadonlySet<string>;
  relatedFavoriteIds?: ReadonlySet<string>;
  relatedLibraryIds?: ReadonlySet<string>;
  onToggleRelatedFavorite?: (series: Series) => void;
  onAddRelatedToLibrary?: (series: Series) => void;
  series: Series;
  episodes: Episode[];
  showAdultContent: boolean;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onPlay: (item: PlayableItem) => void;
  onFavorite: () => void;
  favorite: boolean;
  inLibrary: boolean;
  continueWatching: boolean;
  onContinueWatching: () => void;
  onAddToLibrary: () => void;
  onRemoveFromLibrary: () => void;
}) {
  const [seasonSelection, setSeasonSelection] = useState<{ seriesId: string; season: number | "all" }>(() => ({
    seriesId: series.id,
    season: 1,
  }));
  const requestedSeason = seasonSelection.seriesId === series.id ? seasonSelection.season : 1;
  const availableEpisodes = showAdultContent
    ? episodes
    : episodes.filter((episode) => !isAdultContent(episode.name));
  const seasons = [...new Set(availableEpisodes.map((episode) => episode.season))].sort((a, b) => a - b);
  const season = requestedSeason === "all"
    ? "all"
    : seasons.includes(requestedSeason)
      ? requestedSeason
      : seasons.includes(1)
        ? 1
        : seasons[0] ?? "all";
  const visible = availableEpisodes
    .filter((episode) => season === "all" || episode.season === season)
    .sort((a, b) => a.season - b.season || a.number - b.number);
  const orderedEpisodes = [...availableEpisodes].sort((a, b) => a.season - b.season || a.number - b.number);
  // Season 0 holds extras and specials; the first episode to play is the first of the real seasons.
  const firstEpisode = orderedEpisodes.find((episode) => episode.season > 0) ?? orderedEpisodes[0];
  const relatedSeries = relatedPlaylistItems(series, playlistSeries);
  const seasonCount = seasons.length;
  const seriesDetails = loading
    ? "SERIES DETAILS / LOADING EPISODES"
    : `SERIES DETAILS / ${seasonCount} ${seasonCount === 1 ? "SEASON" : "SEASONS"} / ${availableEpisodes.length} ${availableEpisodes.length === 1 ? "EPISODE" : "EPISODES"}`;

  return (
    <section className="series-detail-page">
      <button className="back-button" data-tooltip="Back to Series overview" onClick={onBack} type="button"><Icon name="arrow_back" /> Series</button>
      <header className="series-detail-header">
        {series.posterUrl && <img alt="" aria-hidden="true" className="detail-backdrop" src={series.posterUrl} />}
        <div>
          <p className="eyebrow">{seriesDetails}</p>
          <h1>{series.name}</h1>
          <div className="detail-meta">
            <span>{series.rating !== undefined ? `★ ${series.rating.toFixed(1)}` : "No rating"}</span>
            {series.year !== undefined && <span>{series.year}</span>}
            {series.category && <span>{series.category}</span>}
          </div>
          {series.overview?.trim() && <p>{series.overview}</p>}
          <ExternalRatingsPanel item={series} mediaType="SERIES" service={ratingsService} />
          <div className="movie-detail-actions">
            <button
              className="primary-button"
              disabled={!continueWatching && (loading || !firstEpisode)}
              onClick={() => {
                if (continueWatching) onContinueWatching();
                else if (firstEpisode) onPlay(playableEpisode(series, firstEpisode));
              }}
              type="button"
            >
              <Icon name="play_arrow" /> {continueWatching ? "Continue watching" : "Play first episode"}
            </button>
            <button
              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={favorite}
              className={`detail-icon-button favorite${favorite ? " selected" : ""}`}
              data-tooltip={favorite ? "Remove from favorites" : "Add to favorites"}
              onClick={onFavorite}
              type="button"
            >
              <Icon name={favorite ? "favorite" : "favorite_border"} />
            </button>
            <button
              aria-label={inLibrary ? "Remove from library" : "Add to watchlist"}
              aria-pressed={inLibrary}
              className={`detail-icon-button${inLibrary ? " selected" : ""}`}
              data-tooltip={inLibrary ? "Remove from library" : "Add to watchlist"}
              onClick={inLibrary ? onRemoveFromLibrary : onAddToLibrary}
              type="button"
            >
              <Icon name={inLibrary ? "check" : "library_add"} />
            </button>
          </div>
        </div>
      </header>
      <div className="episode-heading">
        <div>
          <p className="eyebrow">YOUR NEXT BINGE</p>
          <h2>Episodes</h2>
        </div>
        {seasons.length > 1 && (
          <div className="category-select">
            <Icon name="filter_list" />
            <CustomSelect
              ariaLabel="Filter season"
              onValueChange={(value) => setSeasonSelection({
                seriesId: series.id,
                season: value === "all" ? "all" : Number(value),
              })}
              options={[
                { label: "All seasons", value: "all" },
                ...seasons.map((value) => ({ label: `Season ${value}`, value: String(value) })),
              ]}
              value={String(season)}
              variant="embedded"
            />
          </div>
        )}
      </div>
      {loading && (
        <div aria-live="polite" role="status">
          <span className="sr-only">Loading episodes…</span>
          <RowSkeletons count={5} />
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && availableEpisodes.length === 0 && (
        <div className="catalog-empty compact-empty"><h2>No episodes found</h2><p>The provider returned no episode details for this series.</p></div>
      )}
      <div className="episode-list">
        {visible.map((episode) => (
          <div className="episode-download-row" key={episode.id}>
            <button
              className="episode-row"
              data-tooltip="Play episode"
              data-tooltip-placement="bottom"
              onClick={() => onPlay(playableEpisode(series, episode))}
              type="button"
            >
              <span className="episode-play"><Icon name="play_arrow" /></span>
              <span className="episode-copy">
                <strong> S{String(episode.season).padStart(2, "0")} E{String(episode.number).padStart(2, "0")} · {episode.name}</strong>
                {episode.overview && <small>{episode.overview}</small>}
              </span>
              <Icon name="arrow_forward" />
            </button>
            {onDownload && (
              <OfflineDownloadAction
                activeDownloadIds={activeDownloadIds}
                compact
                downloadedIds={downloadedIds}
                media={{
                  id: episode.id,
                  playlistId: episode.playlistId,
                  contentType: "EPISODE",
                  title: `${series.name} · S${String(episode.season).padStart(2, "0")} E${String(episode.number).padStart(2, "0")} · ${episode.name}`,
                  streamUrl: episode.streamUrl,
                  artworkUrl: episode.posterUrl || series.posterUrl,
                  parentTitle: series.name,
                  drmLicenseUrl: episode.drmLicenseUrl,
                  drmSystem: episode.drmSystem,
                }}
                onDownload={onDownload}
              />
            )}
          </div>
        ))}
      </div>
      {onOpenSeries && (
        <MoreFromPlaylist
          favoriteIds={relatedFavoriteIds}
          libraryIds={relatedLibraryIds}
          items={relatedSeries}
          onAddToLibrary={onAddRelatedToLibrary}
          onToggleFavorite={onToggleRelatedFavorite}
          onSelect={onOpenSeries}
          section="Series"
        />
      )}
    </section>
  );
}
