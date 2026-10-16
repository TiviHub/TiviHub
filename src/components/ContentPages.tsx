import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  Movie,
  PlayableItem,
  Series,
} from "../types";
import { Icon } from "./common";

type CatalogSection = "Live TV" | "Movies" | "Series";
type CatalogItem = LiveChannel | Movie | Series;

function titleOf(item: CatalogItem): string {
  return item.name;
}

function categoryOf(item: CatalogItem): string {
  return "group" in item ? item.group : item.category || "Uncategorized";
}

function artworkOf(item: CatalogItem): string | undefined {
  return "group" in item ? item.logoUrl : item.posterUrl;
}

function CatalogCard({
  item,
  section,
  isFavorite,
  inLibrary,
  currentProgram,
  onOpen,
  onFavorite,
  onAddToLibrary,
}: {
  item: CatalogItem;
  section: CatalogSection;
  isFavorite: boolean;
  inLibrary: boolean;
  currentProgram?: EpgProgram;
  onOpen: () => void;
  onFavorite: () => void;
  onAddToLibrary: () => void;
}) {
  const artwork = artworkOf(item);
  const isLive = section === "Live TV";
  const subtitle = isLive
    ? currentProgram?.title || categoryOf(item)
    : categoryOf(item);
  return (
    <article className={`catalog-card${isLive ? " live-card" : ""}`}>
      <button className="catalog-card-main" onClick={onOpen} type="button">
        <span className="catalog-artwork">
          <span className="catalog-artwork-fallback"><Icon name={isLive ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></span>
          {artwork && (
            <img
              alt=""
              loading="lazy"
              onError={(event) => { event.currentTarget.hidden = true; }}
              src={artwork}
            />
          )}
          {isLive && <span className="live-badge"><span /> LIVE</span>}
          {!isLive && "seasons" in item && <span className="catalog-meta">{item.seasons} seasons</span>}
        </span>
        <span className="catalog-card-copy">
          <strong title={titleOf(item)}>{titleOf(item)}</strong>
          <small title={subtitle}>{subtitle}</small>
          {currentProgram && (
            <span className="program-progress">
              <span style={{ width: `${Math.max(0, Math.min(100, ((Date.now() - currentProgram.startMillis) / (currentProgram.endMillis - currentProgram.startMillis)) * 100))}%` }} />
            </span>
          )}
        </span>
      </button>
      <button
        aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-pressed={isFavorite}
        className={`favorite-button${isFavorite ? " selected" : ""}`}
        onClick={onFavorite}
        type="button"
      >
        <Icon name={isFavorite ? "favorite" : "favorite_border"} />
      </button>
      {!isLive && (
        <button
          aria-label={inLibrary ? `${item.name} is saved in your library` : `Add ${item.name} to your watchlist`}
          aria-pressed={inLibrary}
          className={`catalog-library-button${inLibrary ? " selected" : ""}`}
          disabled={inLibrary}
          onClick={onAddToLibrary}
          type="button"
        >
          <Icon name={inLibrary ? "check" : "library_add"} />
        </button>
      )}
    </article>
  );
}

function GuideRow({
  channel,
  programs,
  currentProgram,
  favorite,
  onPlay,
  onFavorite,
}: {
  channel: LiveChannel;
  programs: EpgProgram[];
  currentProgram?: EpgProgram;
  favorite: boolean;
  onPlay: () => void;
  onFavorite: () => void;
}) {
  const now = Date.now();
  const upcoming = programs.filter((program) => program.endMillis > now).slice(0, 3);
  return (
    <article className="guide-row">
      <div className="guide-channel">
        <span className="guide-channel-art">
          {channel.logoUrl ? (
            <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={channel.logoUrl} />
          ) : <Icon name="live_tv" />}
        </span>
        <span><strong>{channel.name}</strong><small>{channel.group}</small></span>
        <button
          aria-label={favorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
          aria-pressed={favorite}
          className={`favorite-button guide-favorite${favorite ? " selected" : ""}`}
          onClick={onFavorite}
          type="button"
        >
          <Icon name={favorite ? "favorite" : "favorite_border"} />
        </button>
      </div>
      <div className="guide-programs">
        {upcoming.length === 0 ? (
          <p className="guide-no-programs">No upcoming programme data.</p>
        ) : upcoming.map((program) => {
          const isCurrent = program.id === currentProgram?.id;
          const progress = isCurrent
            ? Math.max(0, Math.min(100, (now - program.startMillis) / (program.endMillis - program.startMillis) * 100))
            : 0;
          return (
            <div className={`guide-program${isCurrent ? " current" : ""}`} key={program.id}>
              <time dateTime={new Date(program.startMillis).toISOString()}>
                {new Date(program.startMillis).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
              <span>
                <strong title={program.title}>{program.title}</strong>
                {program.synopsis && <small title={program.synopsis}>{program.synopsis}</small>}
                {isCurrent && <span className="guide-progress"><span style={{ width: `${progress}%` }} /></span>}
              </span>
            </div>
          );
        })}
      </div>
      <button className="guide-play-button" onClick={onPlay} type="button">
        <Icon name="play_arrow" /><span>Watch</span>
      </button>
    </article>
  );
}

export function CatalogPage({
  section,
  channels,
  movies,
  series,
  epg,
  favorites,
  library,
  loading,
  guideLoading,
  onLoadGuideForChannels,
  onPlay,
  onOpenMovie,
  onOpenSeries,
  onToggleFavorite,
  onAddToLibrary,
}: {
  section: CatalogSection;
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  epg: EpgProgram[];
  favorites: Favorite[];
  library: LibraryItem[];
  loading: boolean;
  guideLoading: boolean;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onPlay: (item: PlayableItem) => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onToggleFavorite: (item: CatalogItem, contentType: "LIVE" | "MOVIE" | "SERIES") => void;
  onAddToLibrary: (item: CatalogItem, contentType: "MOVIE" | "SERIES") => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [liveView, setLiveView] = useState<"Channels" | "Guide">("Channels");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  useEffect(() => setPage(1), [section]);
  const items = section === "Live TV" ? channels : section === "Movies" ? movies : series;
  const favoriteIds = new Set(favorites.map((favorite) => favorite.contentId));
  const guideByChannel = useMemo(() => {
    const now = Date.now();
    const byChannel = new Map<string, EpgProgram[]>();
    for (const program of epg) {
      if (program.endMillis <= now) continue;
      const list = byChannel.get(program.channelId) ?? [];
      list.push(program);
      byChannel.set(program.channelId, list);
    }
    for (const programs of byChannel.values()) programs.sort((a, b) => a.startMillis - b.startMillis);
    return byChannel;
  }, [epg]);
  const currentByChannel = useMemo(() => {
    const now = Date.now();
    const current = new Map<string, EpgProgram>();
    for (const [channelId, programs] of guideByChannel) {
      const program = programs.find((entry) => entry.startMillis <= now && entry.endMillis > now);
      if (program) current.set(channelId, program);
    }
    return current;
  }, [guideByChannel]);
  const categories = useMemo(
    () => ["All", ...new Set(items.map(categoryOf).filter((value) => value !== "Uncategorized"))],
    [items],
  );
  const filtered = items.filter((item) => {
    const matchesQuery = `${item.name} ${categoryOf(item)}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (category === "All" || categoryOf(item) === category);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const guideChannels = section === "Live TV"
    ? paginatedItems.filter((item): item is LiveChannel => "group" in item)
    : [];
  const guideChannelKey = guideChannels.map((channel) => channel.id).join("|");
  const onLoadGuideRef = useRef(onLoadGuideForChannels);
  onLoadGuideRef.current = onLoadGuideForChannels;
  useEffect(() => {
    if (guideChannels.length > 0) onLoadGuideRef.current(guideChannels);
  }, [guideChannelKey]);
  const firstItem = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, filtered.length);
  const epgForPage = section === "Live TV";

  return (
    <section className="catalog-page">
      <header className="page-intro catalog-intro">
        <div>
          <p className="eyebrow">{section === "Live TV" ? "ON AIR / CHANNELS" : section === "Movies" ? "YOUR CINEMA" : "THE NEXT EPISODE"}</p>
          <h1>{section}<span className="neon-text">.</span></h1>
          <p>{items.length.toLocaleString()} {section === "Live TV" ? "channels" : section.toLowerCase()} in this source</p>
        </div>
        <div className="catalog-controls">
          {section === "Live TV" && (
            <div className="catalog-view-switch" role="group" aria-label="Live TV view">
              {(["Channels", "Guide"] as const).map((value) => (
                <button
                  aria-pressed={liveView === value}
                  className={liveView === value ? "active" : ""}
                  key={value}
                  onClick={() => {
                    setLiveView(value);
                    setPage(1);
                  }}
                  type="button"
                >
                  <Icon name={value === "Guide" ? "schedule" : "live_tv"} /><span>{value}</span>
                </button>
              ))}
            </div>
          )}
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Search {section}</span>
            <input
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${section.toLowerCase()}`}
              value={query}
            />
          </label>
          <label className="category-select">
            <Icon name="filter_list" />
            <span className="sr-only">Filter by category</span>
            <select
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              value={category}
            >
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
          </label>
        </div>
      </header>

      {loading && <div className="inline-status"><span className="spinner" /> Updating your catalog…</div>}
      {items.length === 0 ? (
        <div className="catalog-empty">
          <div className="empty-icon"><Icon name={section === "Live TV" ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></div>
          <h2>{loading ? "Tuning in…" : `No ${section.toLowerCase()} yet`}</h2>
          <p>{loading ? "Your catalog will appear here when the source finishes loading." : "Add or refresh a playlist that includes this content."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="catalog-empty compact-empty">
          <Icon name="search" />
          <h2>No matches</h2>
          <p>Try another title or category.</p>
        </div>
      ) : section === "Live TV" && liveView === "Guide" ? (
        epg.length === 0 ? (
          <div className="catalog-empty compact-empty">
            <div className="empty-icon"><Icon name="schedule" /></div>
            <h2>{guideLoading ? "Loading TV guide…" : "TV guide not loaded"}</h2>
            <p>{guideLoading
              ? "Fetching recent programmes for the channels on this page."
              : "Xtream guide data loads a page at a time when supported. You can also add a smaller XMLTV guide URL in Settings."}</p>
          </div>
        ) : (
          <div className="guide-list">
            {paginatedItems.map((item) => {
              if (!("group" in item)) return null;
              const programs = guideByChannel.get(item.tvgId || item.id) ?? [];
              const current = currentByChannel.get(item.tvgId || item.id);
              return (
                <GuideRow
                  channel={item}
                  currentProgram={current}
                  favorite={favoriteIds.has(item.id)}
                  key={item.id}
                  onFavorite={() => onToggleFavorite(item, "LIVE")}
                  onPlay={() => onPlay({
                    id: item.id,
                    playlistId: item.playlistId,
                    contentType: "LIVE",
                    title: item.name,
                    streamUrl: item.streamUrl,
                    artworkUrl: item.logoUrl,
                    drmLicenseUrl: item.drmLicenseUrl,
                    drmSystem: item.drmSystem,
                    live: true,
                  })}
                  programs={programs}
                />
              );
            })}
          </div>
        )
      ) : (
        <div className={`catalog-grid${epgForPage ? " channel-grid" : ""}`}>
          {paginatedItems.map((item) => {
            const contentType = section === "Live TV" ? "LIVE" : section === "Movies" ? "MOVIE" : "SERIES";
            const currentProgram = "group" in item
              ? currentByChannel.get(item.tvgId || item.id)
              : undefined;
            return (
              <CatalogCard
                currentProgram={currentProgram}
                isFavorite={favoriteIds.has(item.id)}
                inLibrary={library.some((entry) => entry.contentId === item.id && entry.contentType === contentType)}
                item={item}
                key={item.id}
                onFavorite={() => onToggleFavorite(item, contentType)}
                onAddToLibrary={() => {
                  if ("group" in item) return;
                  if ("streamUrl" in item) onAddToLibrary(item, "MOVIE");
                  else onAddToLibrary(item, "SERIES");
                }}
                onOpen={() => {
                  if (section === "Live TV" && "group" in item) {
                    const channel = item;
                    onPlay({
                      id: channel.id,
                      playlistId: channel.playlistId,
                      contentType: "LIVE",
                      title: channel.name,
                      streamUrl: channel.streamUrl,
                      artworkUrl: channel.logoUrl,
                      drmLicenseUrl: channel.drmLicenseUrl,
                      drmSystem: channel.drmSystem,
                      live: true,
                    });
                  } else if (section === "Movies" && "streamUrl" in item && !("group" in item)) {
                    onOpenMovie(item);
                  } else if (!("group" in item) && !("streamUrl" in item)) {
                    onOpenSeries(item);
                  }
                }}
                section={section}
              />
            );
          })}
        </div>
      )}
      {filtered.length > 0 && !(section === "Live TV" && liveView === "Guide" && epg.length === 0) && (
        <nav aria-label={`${section} pagination`} className="catalog-pagination">
          <p className="pagination-range">
            Showing <strong>{firstItem.toLocaleString()}–{lastItem.toLocaleString()}</strong> of {filtered.length.toLocaleString()}
          </p>
          <label className="page-size-control">
            <span>Per page</span>
            <select
              aria-label={`Items per page for ${section}`}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              value={pageSize}
            >
              {[12, 24, 48, 96].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
          </label>
          <div className="pagination-buttons">
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              type="button"
            >
              <Icon name="chevron_left" />
            </button>
            <span aria-live="polite">Page <strong>{currentPage}</strong> of {pageCount}</span>
            <button
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
              type="button"
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}

export function MovieDetail({
  movie,
  favorite,
  inLibrary,
  continueWatching,
  onBack,
  onPlay,
  onFavorite,
  onAddToLibrary,
  onRemoveFromLibrary,
}: {
  movie: Movie;
  favorite: boolean;
  inLibrary: boolean;
  continueWatching: boolean;
  onBack: () => void;
  onPlay: () => void;
  onFavorite: () => void;
  onAddToLibrary: () => void;
  onRemoveFromLibrary: () => void;
}) {
  return (
    <section className="series-detail-page">
      <button className="back-button" onClick={onBack} type="button"><Icon name="arrow_back" /> Movies</button>
      <header className="series-detail-header">
        {movie.posterUrl ? <img alt="" src={movie.posterUrl} /> : <div className="movie-detail-poster"><Icon name="movie" /></div>}
        <div>
          <p className="eyebrow">MOVIE DETAILS{movie.year ? ` / ${movie.year}` : ""}</p>
          <h1>{movie.name}<span className="neon-text">.</span></h1>
          <div className="detail-meta">
            <span>{movie.rating !== undefined ? `★ ${movie.rating.toFixed(1)}` : "No rating"}</span>
            {movie.category && <span>{movie.category}</span>}
          </div>
          <p>{movie.overview || "No overview was provided by this source."}</p>
          <div className="movie-detail-actions">
            <button className="primary-button" onClick={onPlay} type="button">
              <Icon name="play_arrow" /> {continueWatching ? "Continue watching" : "Watch movie"}
            </button>
            <button
              aria-pressed={favorite}
              className={`secondary-button${favorite ? " selected" : ""}`}
              onClick={onFavorite}
              type="button"
            >
              <Icon name={favorite ? "favorite" : "favorite_border"} />
              {favorite ? "Remove from favorites" : "Add to favorites"}
            </button>
            <button
              aria-pressed={inLibrary}
              className={`secondary-button${inLibrary ? " selected" : ""}`}
              onClick={inLibrary ? onRemoveFromLibrary : onAddToLibrary}
              type="button"
            >
              <Icon name={inLibrary ? "delete" : "library_add"} />
              {inLibrary ? "Remove from library" : "Add to watchlist"}
            </button>
          </div>
        </div>
      </header>
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
}: {
  series: Series;
  episodes: Episode[];
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
  const [season, setSeason] = useState<number | "all">("all");
  const seasons = [...new Set(episodes.map((episode) => episode.season))].sort((a, b) => a - b);
  const visible = episodes
    .filter((episode) => season === "all" || episode.season === season)
    .sort((a, b) => a.season - b.season || a.number - b.number);
  const firstEpisode = [...episodes].sort((a, b) => a.season - b.season || a.number - b.number)[0];

  return (
    <section className="series-detail-page">
      <button className="back-button" onClick={onBack} type="button"><Icon name="arrow_back" /> Series</button>
      <header className="series-detail-header">
        {series.posterUrl
          ? <img alt="" src={series.posterUrl} />
          : <div className="movie-detail-poster"><Icon name="tv" /></div>}
        <div>
          <p className="eyebrow">SERIES DETAILS / {series.seasons} {series.seasons === 1 ? "SEASON" : "SEASONS"}</p>
          <h1>{series.name}<span className="neon-text">.</span></h1>
          <div className="detail-meta">
            <span>{series.rating !== undefined ? `★ ${series.rating.toFixed(1)}` : "No rating"}</span>
            {series.year !== undefined && <span>{series.year}</span>}
            {series.category && <span>{series.category}</span>}
          </div>
          <p>{series.overview || "No overview was provided by this source."}</p>
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
              aria-pressed={favorite}
              className={`secondary-button${favorite ? " selected" : ""}`}
              onClick={onFavorite}
              type="button"
            >
              <Icon name={favorite ? "favorite" : "favorite_border"} />
              {favorite ? "Remove from favorites" : "Add to favorites"}
            </button>
            <button
              aria-pressed={inLibrary}
              className={`secondary-button${inLibrary ? " selected" : ""}`}
              onClick={inLibrary ? onRemoveFromLibrary : onAddToLibrary}
              type="button"
            >
              <Icon name={inLibrary ? "delete" : "library_add"} />
              {inLibrary ? "Remove from library" : "Add to watchlist"}
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
          <label className="category-select">
            <Icon name="filter_list" />
            <span className="sr-only">Filter season</span>
            <select onChange={(event) => setSeason(event.target.value === "all" ? "all" : Number(event.target.value))} value={season}>
              <option value="all">All seasons</option>
              {seasons.map((value) => <option key={value} value={value}>Season {value}</option>)}
            </select>
            <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
          </label>
        )}
      </div>
      {loading && <div className="inline-status"><span className="spinner" /> Loading episodes…</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && episodes.length === 0 && (
        <div className="catalog-empty compact-empty"><h2>No episodes found</h2><p>The provider returned no episode details for this series.</p></div>
      )}
      <div className="episode-list">
        {visible.map((episode) => (
          <button
            className="episode-row"
            key={episode.id}
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
        ))}
      </div>
    </section>
  );
}

export function LibraryPage({
  library,
  favorites,
  onPlay,
  onChangeStatus,
  onRemove,
  onRemoveFavorite,
}: {
  library: LibraryItem[];
  favorites: Favorite[];
  onPlay: (item: PlayableItem, position: number) => void;
  onChangeStatus: (item: LibraryItem, status: LibraryItem["status"]) => void;
  onRemove: (id: string, title: string) => void;
  onRemoveFavorite: (favorite: Favorite) => void;
}) {
  const [tab, setTab] = useState<"Continue watching" | "Watchlist" | "Watched" | "Favorites">("Continue watching");
  const watching = [...library]
    .filter((item) => item.status === "WATCHING")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const watchlist = library.filter((item) => item.status === "WATCHLIST");
  const watched = library.filter((item) => item.status === "WATCHED").sort((a, b) => b.updatedAt - a.updatedAt);
  const content = tab === "Continue watching" ? watching : tab === "Watchlist" ? watchlist : tab === "Watched" ? watched : [];

  return (
    <section className="library-page">
      <header className="page-intro">
        <p className="eyebrow">SAVED ON THIS DEVICE</p>
        <h1>Your library<span className="neon-text">.</span></h1>
        <p>Favorites and watch progress stay in this browser.</p>
      </header>
      <div className="library-tabs" role="tablist" aria-label="Library categories">
        {(["Continue watching", "Watchlist", "Watched", "Favorites"] as const).map((value) => (
          <button aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)} role="tab" type="button">
            {value}<span>{value === "Continue watching" ? watching.length : value === "Watchlist" ? watchlist.length : value === "Watched" ? watched.length : favorites.length}</span>
          </button>
        ))}
      </div>
      {tab === "Favorites" ? (
        favorites.length === 0 ? (
          <LibraryEmpty label="No favorites yet" detail="Tap the heart on a channel, movie, or series to keep it here." />
        ) : (
          <div className="favorite-list">
            {favorites.map((favorite) => (
              <article className="favorite-row" key={favorite.id}>
                {favorite.artworkUrl ? <img alt="" loading="lazy" src={favorite.artworkUrl} /> : <span className="favorite-art-placeholder"><Icon name="movie" /></span>}
                <div><strong>{favorite.title}</strong><small>{favorite.contentType}</small></div>
                {favorite.streamUrl && (
                  <button
                    aria-label={`Play ${favorite.title}`}
                    className="icon-button"
                    onClick={() => onPlay({
                      id: favorite.contentId,
                      playlistId: favorite.playlistId,
                      contentType: favorite.contentType,
                      title: favorite.title,
                      streamUrl: favorite.streamUrl!,
                      artworkUrl: favorite.artworkUrl,
                      live: favorite.contentType === "LIVE",
                      drmLicenseUrl: favorite.drmLicenseUrl,
                      drmSystem: favorite.drmSystem,
                    }, 0)}
                    type="button"
                  >
                    <Icon name="play_arrow" />
                  </button>
                )}
                <button aria-label={`Remove ${favorite.title} from favorites`} className="icon-button" onClick={() => onRemoveFavorite(favorite)} type="button">
                  <Icon name="favorite" />
                </button>
              </article>
            ))}
          </div>
        )
      ) : content.length === 0 ? (
        <LibraryEmpty
          label={tab === "Continue watching" ? "Nothing in progress" : tab === "Watchlist" ? "Your watchlist is empty" : "Nothing watched yet"}
          detail={tab === "Continue watching" ? "Start a movie or episode, and your place will be saved automatically." : "Add titles from your provider catalog to keep them close."}
        />
      ) : (
        <div className="library-items">
          {content.map((item) => (
            <article className="library-item" key={item.id}>
              {item.artworkUrl
                ? <img alt="" loading="lazy" src={item.artworkUrl} />
                : <span className="favorite-art-placeholder"><Icon name="movie" /></span>}
              <button className="library-item-main" onClick={() => item.streamUrl && onPlay({
                id: item.contentId,
                playlistId: item.playlistId,
                contentType: item.contentType,
                title: item.title,
                streamUrl: item.streamUrl,
                artworkUrl: item.artworkUrl,
                live: item.contentType === "LIVE",
                drmLicenseUrl: item.drmLicenseUrl,
                drmSystem: item.drmSystem,
                parentId: item.parentId,
                parentTitle: item.parentTitle,
              }, item.positionMillis)} type="button">
                <strong>{item.title}</strong>
                {item.parentTitle && <small>{item.parentTitle}</small>}
                {item.durationMillis > 0 && (
                  <span className="library-progress">
                    <span style={{ width: `${Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100))}%` }} />
                  </span>
                )}
              </button>
              <label className="status-select">
                <span className="sr-only">Library status for {item.title}</span>
                <select onChange={(event) => onChangeStatus(item, event.target.value as LibraryItem["status"])} value={item.status}>
                  <option value="WATCHLIST">Watchlist</option>
                  <option value="WATCHING">Watching</option>
                  <option value="WATCHED">Watched</option>
                </select>
                <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
              </label>
              <button aria-label={`Remove ${item.title} from library`} className="icon-button" onClick={() => onRemove(item.id, item.title)} type="button">
                <Icon name="delete" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryEmpty({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="catalog-empty library-empty">
      <div className="empty-icon"><Icon name="bookmark" /></div>
      <h2>{label}</h2>
      <p>{detail}</p>
    </div>
  );
}
