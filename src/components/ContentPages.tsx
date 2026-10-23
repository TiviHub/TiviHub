import { ProgressIndicator } from "./ProgressIndicator";
import { CardSkeletons, RowSkeletons, Skeleton } from "./Skeleton";
import { ExternalRatingsPanel } from "./ExternalRatings";
import type { RatingsService } from "../services/ratingsService";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { isAdultContent } from "../lib/adultContent";
import type {
  ContentType,
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  MdblistPopularItem,
  Movie,
  PlayableItem,
  Series,
} from "../types";
import {
  canDownloadMedia,
  downloadIdFor,
  type DownloadableMedia,
} from "../services/downloads";
import { rankLocalCatalogByPopularity } from "../lib/catalogPopularity";
import type { PopularCatalogService } from "../services/popularCatalogService";
import { sortCatalogItems, topCatalogItems, type CatalogSort } from "../lib/catalogSorting";
import { CustomSelect, Icon, type CustomSelectOption } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";
import { NoSourceEmptyState } from "./NoSourceEmptyState";

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

// Not a real group name: picks every channel marked as a radio station.
const RADIO_FILTER = "@@radio";
const categoryLabel = (value: string) => value === RADIO_FILTER ? "Radio" : value;

function categoryOf(item: CatalogItem): string {
  return "group" in item ? item.group : item.category || "Uncategorized";
}

function artworkOf(item: CatalogItem): string | undefined {
  return "group" in item ? item.logoUrl : item.posterUrl;
}

export function playableChannel(channel: LiveChannel): PlayableItem {
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
    radio: channel.radio,
  };
}

function CatalogCard({
  item,
  section,
  subtitleOverride,
  isFavorite,
  inLibrary,
  currentProgram,
  guideLoading = false,
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
  guideLoading?: boolean;
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
        data-tooltip={isLive ? `Play ${item.name}` : `View details for ${item.name}`}
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
          {!isLive && "seasons" in item && item.seasons > 0 && (
            <span className="catalog-meta">{item.seasons} seasons</span>
          )}
        </span>
        <span className="catalog-card-copy">
          <strong data-tooltip={titleOf(item)}>{titleOf(item)}</strong>
          <small data-tooltip={subtitle}>{subtitle}</small>
          {isLive && guideLoading && !currentProgram && <Skeleton className="skeleton-line" />}
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
        data-tooltip={`${isFavorite ? "Remove" : "Add"} ${isLive ? "TV Channel" : section === "Movies" ? "Movie" : "Series"} ${isFavorite ? "from" : "to"} favorites`}
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
          data-tooltip={inLibrary ? "Already in your library" : "Add to watchlist"}
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
  guideLoading = false,
  mdblistApiKey = "",
  popularCatalogService,
}: {
  section: CatalogSection;
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  epg: EpgProgram[];
  favorites: Favorite[];
  library: LibraryItem[];
  loading: boolean;
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
  guideLoading?: boolean;
  mdblistApiKey?: string;
  popularCatalogService?: PopularCatalogService;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<CatalogSort>("added");
  const [isSorting, startSortTransition] = useTransition();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [popularState, setPopularState] = useState<
    { mediaType: "MOVIE" | "SERIES"; items: MdblistPopularItem[]; error?: boolean } | null
  >(null);
  const deferredQuery = useDeferredValue(query);
  const featuredMediaType = section === "Movies" ? "MOVIE" : section === "Series" ? "SERIES" : null;
  const items = section === "Live TV" ? channels : section === "Movies" ? movies : series;
  useEffect(() => setPage(1), [section]);
  useEffect(() => {
    if (!featuredMediaType || !mdblistApiKey.trim() || !popularCatalogService || deferredQuery.trim() || items.length === 0) {
      setPopularState(null);
      return;
    }
    let active = true;
    setPopularState(null);
    void popularCatalogService.getPopularCatalog(featuredMediaType, mdblistApiKey).then((items) => {
      if (active) setPopularState({ mediaType: featuredMediaType, items });
    }).catch(() => {
      if (active) setPopularState({ mediaType: featuredMediaType, items: [], error: true });
    });
    return () => { active = false; };
  }, [deferredQuery, featuredMediaType, items.length, mdblistApiKey, popularCatalogService]);
  const selectedGroupChannels = section === "Live TV" && category !== "All"
    ? channels.filter((channel) => category === RADIO_FILTER ? channel.radio : channel.group === category)
    : [];
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.contentId)), [favorites]);
  const liveFavorites = useMemo(() => {
    if (section !== "Live TV") return [];
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    return favorites
      .filter((favorite) => favorite.contentType === "LIVE" && byId.has(favorite.contentId))
      .map((favorite) => ({ favorite, channel: byId.get(favorite.contentId)! }));
  }, [channels, favorites, section]);
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
      ...(section === "Live TV" && channels.some((channel) => channel.radio) ? [RADIO_FILTER] : []),
      ...[...names].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })),
    ];
  }, [channels, items, section]);
  const sortedItems = useMemo(() => section === "Movies"
    ? sortCatalogItems(movies, sort)
    : section === "Series"
      ? sortCatalogItems(series, sort)
      : channels,
  [channels, movies, section, series, sort]);
  const searchableItems = useMemo(
    () => sortedItems.map((item) => {
      const categoryName = categoryOf(item);
      return {
        item,
        category: categoryName,
        radio: "group" in item && Boolean(item.radio),
        searchText: `${item.name} ${categoryName}`.toLowerCase(),
      };
    }),
    [sortedItems],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return searchableItems
      .filter(({ category: itemCategory, radio, searchText }) =>
        searchText.includes(normalizedQuery) &&
        (category === "All" || (category === RADIO_FILTER ? radio : itemCategory === category)),
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
  const popularItems = useMemo(() => {
    if (!featuredMediaType || popularState?.mediaType !== featuredMediaType) return [];
    return rankLocalCatalogByPopularity(
      filtered.filter((item): item is FeaturedCatalogItem => !("group" in item)),
      popularState.items,
    ).slice(0, 5);
  }, [featuredMediaType, filtered, popularState]);
  const usePopularPanel = Boolean(
    mdblistApiKey.trim() && popularCatalogService && !deferredQuery.trim() && featuredMediaType,
  );
  const featuredItems = usePopularPanel && popularItems.length > 0 ? popularItems : recentlyAdded;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const guideChannels = section === "Live TV"
    ? paginatedItems.filter((item): item is LiveChannel => "group" in item)
    : [];
  const selectedChannel = guideChannels.find((channel) => channel.id === selectedChannelId)
    ?? channels.find((channel) => channel.id === livePlaybackItemId)
    ?? guideChannels[0];
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
        guideLoading={guideLoading}
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

  const filtersActive = query.trim() !== "" || category !== "All";

  return (
    <section className={`catalog-page${livePlayerMini ? " live-tv-mini-page" : ""}`}>
      <header className="page-intro catalog-intro">
        <div>
          <p className="eyebrow">{section === "Live TV" ? "ON AIR / CHANNELS" : section === "Movies" ? "YOUR CINEMA" : "THE NEXT EPISODE"}</p>
          <h1>{section}</h1>
          <p>
            {filtersActive
              ? `${filtered.length.toLocaleString()} of ${items.length.toLocaleString()} ${section === "Live TV" ? "channels" : section.toLowerCase()}${category !== "All" ? ` in ${categoryLabel(category)}` : ""}`
              : `${items.length.toLocaleString()} ${section === "Live TV" ? "channels" : section.toLowerCase()} in this source`}
            {filtersActive && (
              <>
                {" · "}
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
              </>
            )}
          </p>
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
          {selectedGroupChannels.length > 0 && onCheckStreamGroup && (
            <button
              aria-label={`Check all ${selectedGroupChannels.length} channels in ${category}`}
              className="secondary-button catalog-group-check"
              onClick={() => onCheckStreamGroup(selectedGroupChannels, category)}
              data-tooltip={`Check all ${selectedGroupChannels.length} channels in this group`}
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
          <div className="category-select">
            <Icon name="filter_list" />
            <CustomSelect
              ariaLabel="Filter by category"
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={categories.map((value) => ({ label: categoryLabel(value), value }))}
              value={category}
              variant="embedded"
            />
          </div>
        </div>
      </header>

      {(loading || isSorting) && (
        <div aria-live="polite" role="status">
          <span className="sr-only">{isSorting ? "Sorting your catalog…" : "Updating your catalog…"}</span>
          <ProgressIndicator label={isSorting ? "Sorting your catalog" : "Updating your catalog"} />
        </div>
      )}
      {(section === "Movies" || section === "Series") &&
        deferredQuery.trim() === "" &&
        (featuredItems.length > 0 || (usePopularPanel && (!popularState || popularState.error))) && (
          <div className="catalog-featured">
            <section aria-label={usePopularPanel && popularItems.length > 0 ? "Popular on TMDB" : "Top 5 · Recently added"} className="catalog-featured-row">
              <div className="catalog-featured-heading">
                <h2>{usePopularPanel && popularItems.length > 0 ? "Popular on TMDB" : "Top 5 · Recently added"}</h2>
              </div>
              {usePopularPanel && popularState?.error && (
                <p aria-live="polite" role="status">MDBList popular titles are unavailable. Showing recently added instead.</p>
              )}
              {usePopularPanel && !popularState
                ? (
                  <div aria-live="polite" role="status">
                    <span className="sr-only">Loading popular titles…</span>
                    <CardSkeletons className="catalog-featured-grid" count={5} />
                  </div>
                )
                : (
                  <div className="catalog-grid catalog-featured-grid">
                    {featuredItems.map((item) => renderCatalogCard(item))}
                  </div>
                )}
            </section>
          </div>
        )}
      {items.length === 0 ? (
        loading ? (
          <div aria-live="polite" role="status">
            <span className="sr-only">Tuning in… Your catalog will appear here when the source finishes loading.</span>
            <CardSkeletons count={section === "Live TV" ? 12 : 18} live={section === "Live TV"} />
          </div>
        ) : (
          <div aria-live="polite" className="catalog-empty" role="status">
            <div className="empty-icon"><Icon name={section === "Live TV" ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></div>
            <h2>{`No ${section.toLowerCase()} yet`}</h2>
            <p>Add or refresh a playlist that includes this content.</p>
          </div>
        )
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
        <div className="live-tv-layout">
          <div className="live-channel-columns">
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
                      data-tooltip={`${channel.name} · ${channel.group}${current ? ` · ${current.title}` : ""}`}
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        onPlay(playableChannel(channel));
                      }}
                      type="button"
                    >
                      <span className="live-channel-list-art">
                        {channel.logoUrl ? (
                          <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={channel.logoUrl} />
                        ) : <Icon name={channel.radio ? "radio" : "live_tv"} />}
                      </span>
                      <span className="live-channel-list-copy">
                        <strong>{channel.name}</strong>
                        <small>{channel.group}</small>
                        {current && <small className="live-channel-current-program">{current.title}</small>}
                        {!current && guideLoading && <Skeleton className="skeleton-line" />}
                      </span>
                      {livePlaybackItemId === channel.id && <span aria-label="Playing" className="live-channel-playing"><Icon name="play_arrow" /></span>}
                    </button>
                    <button
                      aria-label={isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
                      aria-pressed={isFavorite}
                      className={`live-channel-favorite${isFavorite ? " selected" : ""}`}
                      data-tooltip={isFavorite ? "Remove TV Channel from favorites" : "Add TV Channel to favorites"}
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
                <div className="live-channel-pagination-buttons">
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
          <aside aria-label="Favorite live TV channels" className="live-channel-sidebar live-favorites-sidebar">
            <div className="live-channel-sidebar-heading">
              <h2>Favorites</h2>
              <span>{liveFavorites.length.toLocaleString()}</span>
            </div>
            <div className="live-channel-list" role="list">
              {liveFavorites.length === 0 && (
                <div className="live-guide-empty">Tap the heart on a channel to add it here.</div>
              )}
              {liveFavorites.map(({ favorite, channel }) => {
                const isSelected = livePlaybackItemId === channel.id;
                return (
                  <article className={`live-channel-list-item${isSelected ? " selected" : ""}`} key={favorite.id} role="listitem">
                    <button
                      aria-label={`Play ${favorite.title}`}
                      aria-pressed={isSelected}
                      className="live-channel-select"
                      data-tooltip={`Play ${channel.name}`}
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
                        <strong>{channel.name}</strong>
                      </span>
                      {isSelected && <span aria-label="Playing" className="live-channel-playing"><Icon name="play_arrow" /></span>}
                    </button>
                    <button
                      aria-label={`Remove ${channel.name} from favorites`}
                      aria-pressed
                      className="live-channel-favorite selected"
                      data-tooltip="Remove TV Channel from favorites"
                      onClick={() => onToggleFavorite(channel, "LIVE")}
                      type="button"
                    >
                      <Icon name="favorite" />
                    </button>
                  </article>
                );
              })}
            </div>
          </aside>
          </div>
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
                  <p>
                    {selectedChannel
                      ? (currentByChannel.get(selectedChannel.tvgId || selectedChannel.id)?.title
                        ? `On now: ${currentByChannel.get(selectedChannel.tvgId || selectedChannel.id)?.title}`
                        : selectedChannel.group)
                      : "Select a channel to start its live stream."}
                  </p>
                  {selectedChannel && (
                    <button className="primary-button" onClick={() => onPlay(playableChannel(selectedChannel))} type="button">
                      <Icon name="play_arrow" /> Watch live
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
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

export function LibraryPage({
  library,
  favorites,
  onPlay,
  onChangeStatus,
  onRemove,
  onRemoveFavorite,
  onOpenFavorite,
  onBrowseMovies,
  sourceCount,
  onAddSource,
}: {
  library: LibraryItem[];
  favorites: Favorite[];
  onPlay: (item: PlayableItem, position: number) => void;
  onChangeStatus: (item: LibraryItem, status: LibraryItem["status"]) => void;
  onRemove: (id: string, title: string) => void;
  onRemoveFavorite: (favorite: Favorite) => void;
  onOpenFavorite?: (favorite: Favorite) => void;
  onBrowseMovies?: () => void;
  sourceCount: number;
  onAddSource: () => void;
}) {
  const [tab, setTab] = useState<"Continue watching" | "Watchlist" | "Watched" | "Favorites">("Continue watching");
  const [contentFilter, setContentFilter] = useState<LibraryGroupKey | "ALL">("ALL");
  const watching = [...library]
    .filter((item) => item.status === "WATCHING" && item.contentType !== "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const watchlist = library.filter((item) => item.status === "WATCHLIST" && item.contentType !== "LIVE");
  const watched = library
    .filter((item) => item.status === "WATCHED" && item.contentType !== "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const content = tab === "Continue watching" ? watching : tab === "Watchlist" ? watchlist : tab === "Watched" ? watched : [];
  const activeItems = tab === "Favorites" ? favorites : content;
  const visibleContent = contentFilter === "ALL"
    ? content
    : content.filter((item) => libraryGroupFor(item.contentType) === contentFilter);
  const visibleFavorites = contentFilter === "ALL"
    ? favorites
    : favorites.filter((favorite) => libraryGroupFor(favorite.contentType) === contentFilter);

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddSource} />;
  }

  if (library.length === 0 && favorites.length === 0) {
    return (
      <HomeEmptyState
        actionIcon="play_arrow"
        actionLabel="Start watching"
        description="Start watching a movie, series, or live channel and it will appear here."
        eyebrow="YOUR LIBRARY"
        onAction={() => onBrowseMovies?.()}
        title="Your library is empty"
      />
    );
  }

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
            <Icon name={value === "Continue watching" ? "play_arrow" : value === "Watchlist" ? "bookmark" : value === "Watched" ? "check_circle" : "favorite"} />
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
            if (count === 0) return null;
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
              <article className={`favorite-row${favorite.contentType === "LIVE" ? " live-favorite-row" : ""}`} key={favorite.id}>
                <button
                  aria-label={favorite.contentType === "LIVE" ? `Play ${favorite.title}` : `View details for ${favorite.title}`}
                  className="favorite-art-button"
                  disabled={favorite.contentType === "LIVE" ? !favorite.streamUrl : !onOpenFavorite}
                  onClick={() => {
                    if (favorite.contentType === "LIVE" && favorite.streamUrl) {
                      onPlay({
                        id: favorite.contentId,
                        playlistId: favorite.playlistId,
                        contentType: favorite.contentType,
                        title: favorite.title,
                        streamUrl: favorite.streamUrl,
                        artworkUrl: favorite.artworkUrl,
                        live: true,
                        drmLicenseUrl: favorite.drmLicenseUrl,
                        drmSystem: favorite.drmSystem,
                      }, 0);
                    } else {
                      onOpenFavorite?.(favorite);
                    }
                  }}
                  type="button"
                >
                  <span className="library-item-art-fallback">
                    <Icon name={LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.icon} />
                  </span>
                  {favorite.artworkUrl && <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={favorite.artworkUrl} />}
                  <span aria-hidden="true" className="library-item-art-play">
                    <Icon name={favorite.contentType === "LIVE" ? "play_arrow" : "arrow_forward"} />
                    <span>{favorite.contentType === "LIVE" ? "Play" : "See details"}</span>
                  </span>
                </button>
                <div>
                  <strong>{favorite.title}</strong>
                  <small>{LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.label}</small>
                </div>
                {favorite.streamUrl && (
                  <button
                    aria-label={`Play ${favorite.title}`}
                    className="icon-button"
                    data-tooltip="Play"
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
                <button aria-label={`Remove ${favorite.title} from favorites`} className="icon-button is-favorite" data-tooltip="Remove from favorites" onClick={() => onRemoveFavorite(favorite)} type="button">
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
                        <small>
                          {LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(item.contentType))?.label}
                          {item.parentTitle ? ` · ${item.parentTitle}` : ""}
                          {item.status === "WATCHING" && item.durationMillis > 0 ? ` · ${Math.round(Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100)))}% watched` : ""}
                        </small>
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
                    <button aria-label={`Remove ${item.title} from library`} className="icon-button" data-tooltip="Remove from library" onClick={() => onRemove(item.id, item.title)} type="button">
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
