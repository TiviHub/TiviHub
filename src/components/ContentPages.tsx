import { ExternalRatingsPanel } from "./ExternalRatings";
import type { RatingsService } from "../ratingsService";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { isAdultContent } from "../adultContent";
import type {
  ContentType,
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  Movie,
  PlayableItem,
  Series,
} from "../types";
import { sortCatalogItems, topCatalogItems, type CatalogSort } from "../catalogSorting";
import { LiveGuide } from "./LiveGuide";
import { CustomSelect, Icon, type CustomSelectOption } from "./common";

type CatalogSection = "Live TV" | "Movies" | "Series";
type CatalogItem = LiveChannel | Movie | Series;
type FeaturedCatalogItem = Movie | Series;
type LibraryGroupKey = "LIVE" | "MOVIE" | "SERIES";

const LIBRARY_CONTENT_GROUPS = [
  { key: "LIVE", label: "Live TV", icon: "live_tv" },
  { key: "MOVIE", label: "Movies", icon: "movie" },
  { key: "SERIES", label: "Series", icon: "tv" },
] as const;

function libraryGroupFor(contentType: ContentType): LibraryGroupKey {
  if (contentType === "LIVE") return "LIVE";
  if (contentType === "MOVIE") return "MOVIE";
  return "SERIES";
}

const CATALOG_SORT_OPTIONS: readonly CustomSelectOption<CatalogSort>[] = [
  { label: "Default (Latest Added)", value: "added" },
  { label: "Alphabetical (A-Z)", value: "name" },
  { label: "Year (Newest)", value: "year" },
  { label: "Rating (Highest)", value: "rating" },
];

const LIBRARY_STATUS_OPTIONS: readonly CustomSelectOption<LibraryItem["status"]>[] = [
  { label: "Watchlist", value: "WATCHLIST" },
  { label: "Watching", value: "WATCHING" },
  { label: "Watched", value: "WATCHED" },
];

function titleOf(item: CatalogItem): string {
  return item.name;
}

function categoryOf(item: CatalogItem): string {
  return "group" in item ? item.group : item.category || "Uncategorized";
}

function artworkOf(item: CatalogItem): string | undefined {
  return "group" in item ? item.logoUrl : item.posterUrl;
}

function playableChannel(channel: LiveChannel): PlayableItem {
  return {
    id: channel.id,
    playlistId: channel.playlistId,
    contentType: "LIVE",
    title: channel.name,
    streamUrl: channel.streamUrl,
    artworkUrl: channel.logoUrl,
    drmLicenseUrl: channel.drmLicenseUrl,
    drmSystem: channel.drmSystem,
    live: true,
  };
}

function CatalogCard({
  item,
  section,
  subtitleOverride,
  isFavorite,
  inLibrary,
  currentProgram,
  onOpen,
  onFavorite,
  onAddToLibrary,
}: {
  item: CatalogItem;
  section: CatalogSection;
  subtitleOverride?: string;
  isFavorite: boolean;
  inLibrary: boolean;
  currentProgram?: EpgProgram;
  onOpen: () => void;
  onFavorite: () => void;
  onAddToLibrary: () => void;
}) {
  const artwork = artworkOf(item);
  const isLive = section === "Live TV";
  const subtitle = subtitleOverride ?? (isLive
    ? currentProgram?.title || categoryOf(item)
    : categoryOf(item));
  return (
    <article className={`catalog-card${isLive ? " live-card" : ""}`}>
      <button
        aria-label={isLive ? `Play ${item.name}` : `View details for ${item.name}`}
        className="catalog-card-main"
        onClick={onOpen}
        type="button"
      >
        <span className="catalog-artwork">
          <span className="catalog-artwork-fallback"><Icon name={isLive ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></span>
          {artwork && (
            <img
              alt=""
              draggable={false}
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
  onCheckStreamGroup,
  livePlayer,
  livePlaybackItemId,
  livePlayerMini = false,
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
  onCheckStreamGroup?: (channels: LiveChannel[], groupName: string) => void;
  livePlayer?: ReactNode;
  livePlaybackItemId?: string;
  livePlayerMini?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<CatalogSort>("added");
  const [isSorting, startSortTransition] = useTransition();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showFullGuide, setShowFullGuide] = useState(false);
  const [guidePlayerCollapsed, setGuidePlayerCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const deferredQuery = useDeferredValue(query);
  useEffect(() => setPage(1), [section]);
  useEffect(() => {
    if (livePlayerMini) setShowFullGuide(false);
  }, [livePlayerMini]);
  const items = section === "Live TV" ? channels : section === "Movies" ? movies : series;
  const selectedGroupChannels = section === "Live TV" && category !== "All"
    ? channels.filter((channel) => channel.group === category)
    : [];
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.contentId)), [favorites]);
  const libraryIds = useMemo(
    () => new Set(library.map((entry) => `${entry.contentType}:${entry.contentId}`)),
    [library],
  );
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
  const categories = useMemo(() => {
    const names = new Set(items.map(categoryOf).filter((value) => value !== "Uncategorized"));
    return [
      "All",
      ...[...names].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })),
    ];
  }, [items]);
  const sortedItems = useMemo(() => section === "Movies"
    ? sortCatalogItems(movies, sort)
    : section === "Series"
      ? sortCatalogItems(series, sort)
      : channels,
  [channels, movies, section, series, sort]);
  const searchableItems = useMemo(
    () => sortedItems.map((item) => {
      const categoryName = categoryOf(item);
      return { item, category: categoryName, searchText: `${item.name} ${categoryName}`.toLowerCase() };
    }),
    [sortedItems],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return searchableItems
      .filter(({ category: itemCategory, searchText }) =>
        searchText.includes(normalizedQuery) && (category === "All" || itemCategory === category),
      )
      .map(({ item }) => item);
  }, [category, deferredQuery, searchableItems]);
  const recentlyAdded = section === "Movies" || section === "Series"
    ? topCatalogItems(
      filtered.filter((item): item is FeaturedCatalogItem => !("group" in item)),
      "added",
      5,
    )
    : [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const guideChannels = section === "Live TV"
    ? paginatedItems.filter((item): item is LiveChannel => "group" in item)
    : [];
  const selectedChannel = guideChannels.find((channel) => channel.id === selectedChannelId)
    ?? channels.find((channel) => channel.id === livePlaybackItemId)
    ?? guideChannels[0];
  const selectedChannelPrograms = selectedChannel
    ? guideByChannel.get(selectedChannel.tvgId || selectedChannel.id) ?? []
    : [];
  const guideChannelsToLoad = selectedChannel && !guideChannels.some((channel) => channel.id === selectedChannel.id)
    ? [...guideChannels, selectedChannel]
    : guideChannels;
  const guideChannelKey = guideChannelsToLoad.map((channel) => channel.id).join("|");
  const onLoadGuideRef = useRef(onLoadGuideForChannels);
  onLoadGuideRef.current = onLoadGuideForChannels;
  useEffect(() => {
    if (guideChannelsToLoad.length > 0) onLoadGuideRef.current(guideChannelsToLoad);
  }, [guideChannelKey]);
  const firstItem = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, filtered.length);

  function renderCatalogCard(item: CatalogItem, subtitleOverride?: string) {
    const contentType = "group" in item ? "LIVE" : "streamUrl" in item ? "MOVIE" : "SERIES";
    const currentProgram = "group" in item
      ? currentByChannel.get(item.tvgId || item.id)
      : undefined;
    return (
      <CatalogCard
        currentProgram={currentProgram}
        inLibrary={contentType !== "LIVE" && libraryIds.has(`${contentType}:${item.id}`)}
        isFavorite={favoriteIds.has(item.id)}
        item={item}
        key={item.id}
        onAddToLibrary={() => {
          if ("group" in item) return;
          onAddToLibrary(item, "streamUrl" in item ? "MOVIE" : "SERIES");
        }}
        onFavorite={() => onToggleFavorite(item, contentType)}
        onOpen={() => {
          if ("group" in item) {
            setSelectedChannelId(item.id);
            onPlay(playableChannel(item));
          } else if ("streamUrl" in item) {
            onOpenMovie(item);
          } else {
            onOpenSeries(item);
          }
        }}
        section={section}
        subtitleOverride={subtitleOverride}
      />
    );
  }

  return (
    <section className={`catalog-page${livePlayerMini ? " live-tv-mini-page" : ""}`}>
      <header className="page-intro catalog-intro">
        <div>
          <p className="eyebrow">{section === "Live TV" ? "ON AIR / CHANNELS" : section === "Movies" ? "YOUR CINEMA" : "THE NEXT EPISODE"}</p>
          <h1>{section}</h1>
          <p>{items.length.toLocaleString()} {section === "Live TV" ? "channels" : section.toLowerCase()} in this source</p>
        </div>
        <div className="catalog-controls">
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
          <div className="category-select">
            <Icon name="filter_list" />
            <CustomSelect
              ariaLabel="Filter by category"
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={categories.map((value) => ({ label: value, value }))}
              value={category}
              variant="embedded"
            />
          </div>
          {selectedGroupChannels.length > 0 && onCheckStreamGroup && (
            <button
              aria-label={`Check all ${selectedGroupChannels.length} channels in ${category}`}
              className="secondary-button catalog-group-check"
              onClick={() => onCheckStreamGroup(selectedGroupChannels, category)}
              title={`Check all ${selectedGroupChannels.length} channels in this group`}
              type="button"
            >
              <Icon name="check_circle" />
              Check group
            </button>
          )}
          {(section === "Movies" || section === "Series") && (
            <div className="category-select sort-select">
              <Icon name="sort" />
              <CustomSelect
                ariaLabel={`Sort ${section.toLowerCase()}`}
                onValueChange={(nextSort) => {
                  startSortTransition(() => setSort(nextSort));
                  setPage(1);
                }}
                options={CATALOG_SORT_OPTIONS}
                value={sort}
                variant="embedded"
              />
            </div>
          )}
          {section === "Live TV" && channels.length > 0 && (
            <button
              aria-expanded={showFullGuide}
              className="secondary-button live-guide-open-button"
              onClick={() => setShowFullGuide((open) => !open)}
              type="button"
            >
              <Icon name="schedule" />
              {showFullGuide ? "Close guide" : "Full TV guide"}
            </button>
          )}
        </div>
      </header>

      {(loading || isSorting) && (
        <div aria-live="polite" className="inline-status">
          <span className="spinner" />
          {isSorting ? "Sorting your catalog…" : "Updating your catalog…"}
        </div>
      )}
      {(section === "Movies" || section === "Series") &&
        deferredQuery.trim() === "" &&
        recentlyAdded.length > 0 && (
          <div className="catalog-featured">
            <section aria-label="Top 5 · Recently added" className="catalog-featured-row">
              <div className="catalog-featured-heading">
                <h2>Top 5 · Recently added</h2>
              </div>
              <div className="catalog-grid catalog-featured-grid">
                {recentlyAdded.map((item) => renderCatalogCard(item))}
              </div>
            </section>
          </div>
        )}
      {items.length === 0 ? (
        <div aria-live="polite" className="catalog-empty" role="status">
          <div className="empty-icon"><Icon name={section === "Live TV" ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></div>
          <h2>{loading ? "Tuning in…" : `No ${section.toLowerCase()} yet`}</h2>
          <p>{loading ? "Your catalog will appear here when the source finishes loading." : "Add or refresh a playlist that includes this content."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="catalog-empty compact-empty">
          <Icon name="search" />
          <h2>No matches</h2>
          <p aria-live="polite" role="status">Try another title or category, or clear your filters to see the full catalog.</p>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setCategory("All");
              setPage(1);
            }}
            type="button"
          >
            Clear filters
          </button>
        </div>
      ) : section === "Live TV" ? (
        <div className={`live-tv-layout${showFullGuide ? ` is-full-guide${guidePlayerCollapsed ? " player-collapsed" : ""}` : ""}`}>
          <aside aria-label="Live TV channels" className="live-channel-sidebar">
            <div className="live-channel-sidebar-heading">
              <h2>Channels</h2>
              <span>{filtered.length.toLocaleString()}</span>
            </div>
            <div className="live-channel-list" role="list">
              {guideChannels.map((channel) => {
                const current = currentByChannel.get(channel.tvgId || channel.id);
                const isSelected = selectedChannel?.id === channel.id;
                const isFavorite = favoriteIds.has(channel.id);
                return (
                  <article className={`live-channel-list-item${isSelected ? " selected" : ""}`} key={channel.id} role="listitem">
                    <button
                      aria-label={`Play ${channel.name}`}
                      aria-pressed={isSelected}
                      className="live-channel-select"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        onPlay(playableChannel(channel));
                      }}
                      type="button"
                    >
                      <span className="live-channel-list-art">
                        {channel.logoUrl ? (
                          <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={channel.logoUrl} />
                        ) : <Icon name="live_tv" />}
                      </span>
                      <span className="live-channel-list-copy">
                        <strong title={channel.name}>{channel.name}</strong>
                        <small title={channel.group}>{channel.group}</small>
                        {current && <small className="live-channel-current-program" title={current.title}>{current.title}</small>}
                      </span>
                      {livePlaybackItemId === channel.id && <span aria-label="Playing" className="live-channel-playing"><Icon name="play_arrow" /></span>}
                    </button>
                    <button
                      aria-label={isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
                      aria-pressed={isFavorite}
                      className={`live-channel-favorite${isFavorite ? " selected" : ""}`}
                      onClick={() => onToggleFavorite(channel, "LIVE")}
                      type="button"
                    >
                      <Icon name={isFavorite ? "favorite" : "favorite_border"} />
                    </button>
                  </article>
                );
              })}
            </div>
            {pageCount > 1 && (
              <nav aria-label="Channel pages" className="live-channel-pagination">
                <div className="live-channel-page-size">
                  <CustomSelect
                    ariaLabel="Channels per page"
                    className="live-channel-page-size-dropdown"
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                    options={[12, 24, 48, 96].map((size) => ({ label: String(size), value: String(size) }))}
                    value={String(pageSize)}
                    variant="compact"
                  />
                </div>
                <span>Page <strong>{currentPage}</strong> / <strong>{pageCount}</strong></span>
                <div>
                  <button
                    aria-label="Previous channel page"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    type="button"
                  >
                    <Icon name="chevron_left" />
                  </button>
                  <button
                    aria-label="Next channel page"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    type="button"
                  >
                    <Icon name="chevron_right" />
                  </button>
                </div>
              </nav>
            )}
          </aside>
          <div className="live-tv-main">
            <section aria-label="Live player" className={`live-tv-player${livePlayer ? " has-live-player" : ""}`}>
              {livePlayer ?? (
                <div className="live-player-empty">
                  <div className="live-player-empty-art">
                    {selectedChannel?.logoUrl ? (
                      <img alt="" src={selectedChannel.logoUrl} />
                    ) : <Icon name="live_tv" />}
                  </div>
                  <p className="eyebrow">READY TO WATCH</p>
                  <h2>{selectedChannel?.name ?? "Choose a channel"}</h2>
                  <p>Select a channel to start its live stream.</p>
                  {selectedChannel && (
                    <button className="primary-button" onClick={() => onPlay(playableChannel(selectedChannel))} type="button">
                      <Icon name="play_arrow" /> Watch live
                    </button>
                  )}
                </div>
              )}
            </section>
            {!showFullGuide && (
              <section
                aria-label={`TV guide${selectedChannel ? ` for ${selectedChannel.name}` : ""}`}
                className="live-tv-guide"
              >
                <header className="live-tv-guide-heading">
                  <div>
                    <p className="eyebrow">WHAT'S ON</p>
                    <h2>TV Guide</h2>
                  </div>
                  {selectedChannel && <span title={selectedChannel.name}>{selectedChannel.name}</span>}
                </header>
                {!selectedChannel ? (
                  <div className="live-guide-empty">Select a channel to see its listings.</div>
                ) : selectedChannelPrograms.length === 0 ? (
                  <div aria-live="polite" className="live-guide-empty">
                    {guideLoading ? "Loading guide for this channel…" : "No TV guide listings are available for this channel."}
                  </div>
                ) : (
                  <div className="live-tv-program-list">
                    {selectedChannelPrograms.slice(0, 8).map((program) => {
                      const isCurrent = currentByChannel.get(selectedChannel.tvgId || selectedChannel.id)?.id === program.id;
                      const progress = isCurrent
                        ? Math.max(0, Math.min(100, ((Date.now() - program.startMillis) / (program.endMillis - program.startMillis)) * 100))
                        : 0;
                      return (
                        <article className={`live-tv-program${isCurrent ? " current" : ""}`} key={program.id}>
                          <time dateTime={new Date(program.startMillis).toISOString()}>
                            {new Date(program.startMillis).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </time>
                          <div>
                            <strong title={program.title}>{program.title}</strong>
                            {program.synopsis && <small title={program.synopsis}>{program.synopsis}</small>}
                            {isCurrent && (
                              <span aria-label={`${Math.round(progress)}% complete`} className="live-tv-program-progress">
                                <span style={{ width: `${progress}%` }} />
                              </span>
                            )}
                          </div>
                          {isCurrent && <span className="live-tv-program-on-air">ON AIR</span>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
          {showFullGuide && (
            <LiveGuide
              activeChannelId={livePlaybackItemId}
              channels={channels}
              epg={epg}
              favoriteIds={favoriteIds}
              loading={guideLoading}
              onClose={() => setShowFullGuide(false)}
              onLoadGuideForChannels={onLoadGuideForChannels}
              onPlay={(channel) => {
                setSelectedChannelId(channel.id);
                onPlay(playableChannel(channel));
              }}
              onTogglePlayer={() => setGuidePlayerCollapsed((collapsed) => !collapsed)}
              playerCollapsed={guidePlayerCollapsed}
              selectedChannelId={selectedChannel?.id}
            />
          )}
        </div>
      ) : (
        <div className="catalog-grid">
          {paginatedItems.map((item) => renderCatalogCard(item))}
        </div>
      )}
      {filtered.length > 0 && section !== "Live TV" && (
        <nav aria-label={`${section} pagination`} className="catalog-pagination">
          <p className="pagination-range">
            Showing <strong>{firstItem.toLocaleString()}–{lastItem.toLocaleString()}</strong> of {filtered.length.toLocaleString()}
          </p>
          <div className="page-size-control">
            <span>Per page</span>
            <CustomSelect
              ariaLabel={`Items per page for ${section}`}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
              options={[12, 24, 48, 96].map((size) => ({ label: String(size), value: String(size) }))}
              value={String(pageSize)}
              variant="compact"
            />
          </div>
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
  ratingsService,
}: {
  ratingsService?: RatingsService;
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
          <h1>{movie.name}</h1>
          <div className="detail-meta">
            <span>{movie.rating !== undefined ? `★ ${movie.rating.toFixed(1)}` : "No rating"}</span>
            {movie.category && <span>{movie.category}</span>}
          </div>
          <p>{movie.overview || "No overview was provided by this source."}</p>
          <ExternalRatingsPanel item={movie} mediaType="MOVIE" service={ratingsService} />
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
}: {
  ratingsService?: RatingsService;
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
  const [season, setSeason] = useState<number | "all">("all");
  const availableEpisodes = showAdultContent
    ? episodes
    : episodes.filter((episode) => !isAdultContent(episode.name));
  const seasons = [...new Set(availableEpisodes.map((episode) => episode.season))].sort((a, b) => a - b);
  const visible = availableEpisodes
    .filter((episode) => season === "all" || episode.season === season)
    .sort((a, b) => a.season - b.season || a.number - b.number);
  const firstEpisode = [...availableEpisodes].sort((a, b) => a.season - b.season || a.number - b.number)[0];

  return (
    <section className="series-detail-page">
      <button className="back-button" onClick={onBack} type="button"><Icon name="arrow_back" /> Series</button>
      <header className="series-detail-header">
        {series.posterUrl
          ? <img alt="" src={series.posterUrl} />
          : <div className="movie-detail-poster"><Icon name="tv" /></div>}
        <div>
          <p className="eyebrow">SERIES DETAILS / {series.seasons} {series.seasons === 1 ? "SEASON" : "SEASONS"}</p>
          <h1>{series.name}</h1>
          <div className="detail-meta">
            <span>{series.rating !== undefined ? `★ ${series.rating.toFixed(1)}` : "No rating"}</span>
            {series.year !== undefined && <span>{series.year}</span>}
            {series.category && <span>{series.category}</span>}
          </div>
          <p>{series.overview || "No overview was provided by this source."}</p>
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
          <div className="category-select">
            <Icon name="filter_list" />
            <CustomSelect
              ariaLabel="Filter season"
              onValueChange={(value) => setSeason(value === "all" ? "all" : Number(value))}
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
      {loading && <div className="inline-status"><span className="spinner" /> Loading episodes…</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && availableEpisodes.length === 0 && (
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
  const [contentFilter, setContentFilter] = useState<LibraryGroupKey | "ALL">("ALL");
  const watching = [...library]
    .filter((item) => item.status === "WATCHING")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const watchlist = library.filter((item) => item.status === "WATCHLIST");
  const watched = library.filter((item) => item.status === "WATCHED").sort((a, b) => b.updatedAt - a.updatedAt);
  const content = tab === "Continue watching" ? watching : tab === "Watchlist" ? watchlist : tab === "Watched" ? watched : [];
  const activeItems = tab === "Favorites" ? favorites : content;
  const visibleContent = contentFilter === "ALL"
    ? content
    : content.filter((item) => libraryGroupFor(item.contentType) === contentFilter);
  const visibleFavorites = contentFilter === "ALL"
    ? favorites
    : favorites.filter((favorite) => libraryGroupFor(favorite.contentType) === contentFilter);

  function playLibraryItem(item: LibraryItem) {
    if (!item.streamUrl) return;
    onPlay({
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
    }, item.positionMillis);
  }

  return (
    <section className="library-page">
      <header className="page-intro">
        <p className="eyebrow">SAVED ON THIS DEVICE</p>
        <h1>Your library</h1>
        <p>Favorites and watch progress stay in this app.</p>
      </header>
      <div className="library-tabs" role="group" aria-label="Library categories">
        {(["Continue watching", "Watchlist", "Watched", "Favorites"] as const).map((value) => (
          <button
            aria-pressed={tab === value}
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => {
              setTab(value);
              setContentFilter("ALL");
            }}
            type="button"
          >
            {value}<span>{value === "Continue watching" ? watching.length : value === "Watchlist" ? watchlist.length : value === "Watched" ? watched.length : favorites.length}</span>
          </button>
        ))}
      </div>
      {activeItems.length > 0 && (
        <div className="library-content-tabs" role="group" aria-label={`Filter ${tab} by content type`}>
          <button
            aria-pressed={contentFilter === "ALL"}
            className={contentFilter === "ALL" ? "active" : ""}
            onClick={() => setContentFilter("ALL")}
            type="button"
          >
            All<span>{activeItems.length}</span>
          </button>
          {LIBRARY_CONTENT_GROUPS.map((group) => {
            const count = activeItems.filter((item) => libraryGroupFor(item.contentType) === group.key).length;
            return (
              <button
                aria-pressed={contentFilter === group.key}
                className={contentFilter === group.key ? "active" : ""}
                key={group.key}
                onClick={() => setContentFilter(group.key)}
                type="button"
              >
                <Icon name={group.icon} />{group.label}<span>{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "Favorites" ? (
        visibleFavorites.length === 0 ? (
          <LibraryEmpty label="No favorites yet" detail="Tap the heart on a channel, movie, or series to keep it here." />
        ) : (
          <div className="favorite-list">
            {visibleFavorites.map((favorite) => (
              <article className="favorite-row" key={favorite.id}>
                {favorite.artworkUrl
                  ? <img alt="" loading="lazy" src={favorite.artworkUrl} />
                  : <span className="favorite-art-placeholder"><Icon name={LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.icon} /></span>}
                <div>
                  <strong>{favorite.title}</strong>
                  <small>{LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.label}</small>
                </div>
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
      ) : visibleContent.length === 0 ? (
        <LibraryEmpty
          label={tab === "Continue watching" ? "Nothing in progress" : tab === "Watchlist" ? "Your watchlist is empty" : "Nothing watched yet"}
          detail={tab === "Continue watching"
            ? "Start a movie or episode, and your place will be saved automatically."
            : tab === "Watchlist"
              ? "Add a title from Movies or Series, or change its status to Watchlist."
              : "Change a title's status to Watched when you finish it."}
        />
      ) : (
        <div className="library-items">
          {visibleContent.map((item) => (
            <article className={`library-item${item.contentType === "LIVE" ? " live-library-item" : ""}`} key={item.id}>
                    <button
                      aria-label={`${item.status === "WATCHING" ? "Resume" : item.status === "WATCHED" ? "Replay" : "Watch"} ${item.title}`}
                      className="library-item-main"
                      disabled={!item.streamUrl}
                      onClick={() => playLibraryItem(item)}
                      type="button"
                    >
                      <span className="library-item-art">
                        <span className="library-item-art-fallback">
                          <Icon name={item.contentType === "LIVE" ? "live_tv" : item.contentType === "MOVIE" ? "movie" : "tv"} />
                        </span>
                        {item.artworkUrl && (
                          <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={item.artworkUrl} />
                        )}
                        <span aria-hidden="true" className="library-item-art-play">
                          <Icon name="play_arrow" />
                          <span>{item.status === "WATCHING" ? "Resume" : item.status === "WATCHED" ? "Replay" : "Watch"}</span>
                        </span>
                      </span>
                      <span className="library-item-copy">
                        <strong>{item.title}</strong>
                        {item.parentTitle && <small>{item.parentTitle}</small>}
                        {item.durationMillis > 0 && (
                          <span className="library-progress">
                            <span style={{ width: `${Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100))}%` }} />
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="status-select">
                      <CustomSelect
                        ariaLabel={`Library status for ${item.title}`}
                        onValueChange={(status) => onChangeStatus(item, status)}
                        options={LIBRARY_STATUS_OPTIONS}
                        value={item.status}
                        variant="compact"
                      />
                    </div>
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
