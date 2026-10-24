import { Children, Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchSection } from "../lib/globalSearch";
import { t, tCount } from "../lib/i18n";
import { sectionLabel } from "../lib/sectionLabel";
import type { MessageKey } from "../locales";
import type { ContentType, Favorite, LibraryItem, LiveChannel, Movie, PlayableItem, Playlist, Series } from "../types";
import { Icon, type IconName } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";
import { NoSourceEmptyState } from "./NoSourceEmptyState";


type Section = SearchSection;
const ASSET_BASE_URL = import.meta.env.BASE_URL;
const HOME_LAYOUT_STORAGE_KEY = "tivihub.home.layout";
const HOME_SHELF_KEYS = [
  "continueWatching",
  "watchedChannels",
  "recentlyWatched",
  "favoriteMovies",
  "favoriteSeries",
  "favoriteChannels",
  "watchlist",
] as const;
type HomeShelfKey = (typeof HOME_SHELF_KEYS)[number];
type HomeLayoutPreference = { order: HomeShelfKey[]; hidden: HomeShelfKey[] };

const DEFAULT_HOME_SHELF_ORDER: HomeShelfKey[] = [...HOME_SHELF_KEYS];
const HOME_SHELF_LABELS: Record<HomeShelfKey, MessageKey> = {
  continueWatching: "library.tabContinue",
  watchedChannels: "home.shelfWatchedChannels",
  recentlyWatched: "home.shelfRecentEditor",
  favoriteMovies: "home.shelfFavMovies",
  favoriteSeries: "home.shelfFavSeries",
  favoriteChannels: "home.shelfFavChannels",
  watchlist: "home.shelfWatchlist",
};

function isHomeShelfKey(value: unknown): value is HomeShelfKey {
  return typeof value === "string" && (HOME_SHELF_KEYS as readonly string[]).includes(value);
}

function readHomeLayoutPreference(): HomeLayoutPreference {
  try {
    const stored = window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
    if (!stored) return { order: [...DEFAULT_HOME_SHELF_ORDER], hidden: [] };
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return { order: [...DEFAULT_HOME_SHELF_ORDER], hidden: [] };
    }
    const record = parsed as Record<string, unknown>;
    const storedOrder = Array.isArray(record.order) ? [...new Set(record.order.filter(isHomeShelfKey))] : [];
    const storedHidden = Array.isArray(record.hidden) ? [...new Set(record.hidden.filter(isHomeShelfKey))] : [];
    return {
      order: [...storedOrder, ...DEFAULT_HOME_SHELF_ORDER.filter((key) => !storedOrder.includes(key))],
      hidden: storedHidden,
    };
  } catch (cause) {
    console.error("Could not read the local Home layout preference", cause);
    return { order: [...DEFAULT_HOME_SHELF_ORDER], hidden: [] };
  }
}

export function Home({
  channels,
  favorites,
  library,
  movies,
  series,
  source,
  sourceCount,
  continueWatching,
  onAddSource,
  onOpenMovie,
  onOpenSeries,
  onNavigate,
  onPlay,
  onPreferenceError,
}: {
  channels: LiveChannel[];
  favorites: Favorite[];
  library: LibraryItem[];
  movies: Movie[];
  series: Series[];
  source: Playlist | null;
  sourceCount: number;
  continueWatching: LibraryItem[];
  onAddSource: () => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onNavigate: (section: Section) => void;
  onPlay: (item: PlayableItem, position: number) => void;
  onPreferenceError: (message: string) => void;
}) {
  if (source) {
    return (
      <MediaHome
        channels={channels}
        continueWatching={continueWatching}
        favorites={favorites}
        library={library}
        movies={movies}
        onNavigate={onNavigate}
        onOpenMovie={onOpenMovie}
        onOpenSeries={onOpenSeries}
        onPlay={onPlay}
        onPreferenceError={onPreferenceError}
        series={series}
      />
    );
  }

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddSource} />;
  }

  const destinations: { label: Section; icon: IconName; detail: string }[] = [
    { label: "Live TV", icon: "live_tv", detail: t("home.destLive") },
    { label: "Movies", icon: "movie", detail: t("home.destMovies") },
    { label: "Series", icon: "tv", detail: t("home.destSeries") },
    { label: "Library", icon: "bookmark", detail: t("home.destLibrary") },
  ];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-mark">✳</span> {t("home.heroEyebrow")}</p>
          <h1>{t("home.heroTitle1")}<br /><span className="neon-text">{t("home.heroTitle2")}</span></h1>
          <p className="hero-description">
            {t("home.heroDesc")}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onAddSource} type="button">
              <Icon name="add" />
              {t("home.addFirst")}
              <Icon name="arrow_forward" />
            </button>
            <span className="hero-footnote">{sourceCount ? tCount("home.sources", sourceCount) : t("home.noAccount")}</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
          <div className="orbit-core"><img src={`${ASSET_BASE_URL}icons/tivihub-512.png`} alt="" /></div>
          <span className="orbit-star star-one">✦</span><span className="orbit-star star-two">✧</span>
          <span className="orbit-caption">SIGNAL / 001</span>
        </div>
      </section>

      <section className="privacy-strip" aria-label={t("home.highlightsAria")}>
        <Highlight icon="devices" label={t("home.hlScreens")} detail={t("home.hlWindows")} />
        <Highlight icon="shield" label={t("home.hlLocal")} detail={t("home.hlSaved")} />
        <div className="privacy-status"><span className="status-pulse" /><span>{t("home.noServer")}</span></div>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div><p className="eyebrow">{t("home.pickFreq")}</p><h2>{t("home.oneHub")}</h2></div>
          <span className="section-index">01 — 04</span>
        </div>
        <div className="feature-grid">
          {destinations.map((destination) => (
            <button className="feature-card" key={destination.label} onClick={() => onNavigate(destination.label)} type="button">
              <span className="feature-icon"><Icon name={destination.icon} /></span>
              <span className="feature-arrow"><Icon name="arrow_forward" /></span>
              <span className="feature-title">{sectionLabel(destination.label)}</span>
              <span className="feature-detail">{destination.detail}</span>
            </button>
          ))}
        </div>
      </section>

      {continueWatching.length > 0 && (
        <section className="home-continue-section">
          <div className="section-heading">
            <div><p className="eyebrow">{t("home.eyebrowPickUp")}</p><h2>{t("library.tabContinue")}</h2></div>
            <button className="text-button" onClick={() => onNavigate("Library")} type="button">{t("home.openLibrary")} <Icon name="arrow_forward" /></button>
          </div>
          <div className="home-continue-grid">
            {continueWatching.map((item) => (
              <button
                className={`home-continue-card${item.contentType === "LIVE" ? " live-continue-card" : ""}`}
                key={item.id}
                onClick={() => item.streamUrl && onPlay({
                  id: item.contentId,
                  playlistId: item.playlistId,
                  contentType: item.contentType,
                  title: item.title,
                  streamUrl: item.streamUrl,
                  artworkUrl: item.artworkUrl,
                  drmLicenseUrl: item.drmLicenseUrl,
                  drmSystem: item.drmSystem,
                  live: item.contentType === "LIVE",
                  parentId: item.parentId,
                  parentTitle: item.parentTitle,
                }, item.positionMillis)}
                type="button"
              >
                <span className="continue-art">
                  {item.artworkUrl ? <img alt="" draggable={false} loading="lazy" src={item.artworkUrl} /> : <Icon name="play_arrow" />}
                  <span><Icon name="play_arrow" /></span>
                </span>
                <strong>{item.title}</strong>
                <small>{item.parentTitle || item.contentType}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="page-footer">
        <span>{t("home.footerA")} <span className="footer-separator">/</span> {t("home.footerB")}</span>
        <span>{t("home.authorized")}</span>
      </footer>
    </>
  );
}

function MediaHome({
  channels,
  movies,
  series,
  continueWatching,
  library,
  favorites,
  onNavigate,
  onOpenMovie,
  onOpenSeries,
  onPlay,
  onPreferenceError,
}: {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  continueWatching: LibraryItem[];
  library: LibraryItem[];
  favorites: Favorite[];
  onNavigate: (section: Section) => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onPlay: (item: PlayableItem, position: number) => void;
  onPreferenceError: (message: string) => void;
}) {
  const [homeLayout, setHomeLayout] = useState(readHomeLayoutPreference);
  const [homeEditorOpen, setHomeEditorOpen] = useState(false);
  const watchedChannels = useMemo(() => library
    .filter((item) => item.status === "WATCHED" && item.contentType === "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12), [library]);
  const recentlyWatched = useMemo(() => library
    .filter((item) => item.status === "WATCHED" && item.contentType !== "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12), [library]);
  const watchlist = useMemo(() => library
    .filter((item) => item.status === "WATCHLIST")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12), [library]);
  const watchingCount = library.filter((item) =>
    item.status === "WATCHING",
  ).length;
  const globalFavorites = useMemo(
    () => [...favorites].sort((a, b) => b.addedAt - a.addedAt),
    [favorites],
  );
  const favoriteMovies = useMemo(
    () => globalFavorites.filter((favorite) => favorite.contentType === "MOVIE").slice(0, 12),
    [globalFavorites],
  );
  const favoriteSeries = useMemo(
    () => globalFavorites.filter((favorite) => favorite.contentType === "SERIES").slice(0, 12),
    [globalFavorites],
  );
  const favoriteChannels = useMemo(
    () => globalFavorites.filter((favorite) => favorite.contentType === "LIVE").slice(0, 12),
    [globalFavorites],
  );
  const favoriteMovieCount = favorites.filter((favorite) => favorite.contentType === "MOVIE").length;
  const favoriteSeriesCount = favorites.filter((favorite) => favorite.contentType === "SERIES").length;
  const favoriteChannelCount = favorites.filter((favorite) => favorite.contentType === "LIVE").length;
  function saveHomeLayout(next: HomeLayoutPreference) {
    setHomeLayout(next);
    try {
      window.localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      console.error("Could not save the local Home layout preference", cause);
      onPreferenceError(t("home.layoutSaveFailed"));
    }
  }

  function toggleHomeShelf(key: HomeShelfKey) {
    const hidden = new Set(homeLayout.hidden);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    saveHomeLayout({ ...homeLayout, hidden: [...hidden] });
  }

  function moveHomeShelf(key: HomeShelfKey, direction: -1 | 1) {
    const index = homeLayout.order.indexOf(key);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= homeLayout.order.length) return;
    const order = [...homeLayout.order];
    [order[index], order[destination]] = [order[destination], order[index]];
    saveHomeLayout({ ...homeLayout, order });
  }

  function resetHomeLayout() {
    saveHomeLayout({ order: [...DEFAULT_HOME_SHELF_ORDER], hidden: [] });
  }

  function playLibraryItem(item: LibraryItem, position = item.positionMillis) {
    if (!item.streamUrl) return;
    onPlay({
      id: item.contentId,
      playlistId: item.playlistId,
      contentType: item.contentType,
      title: item.title,
      streamUrl: item.streamUrl,
      artworkUrl: item.artworkUrl,
      drmLicenseUrl: item.drmLicenseUrl,
      drmSystem: item.drmSystem,
      live: item.contentType === "LIVE",
      parentId: item.parentId,
      parentTitle: item.parentTitle,
    }, position);
  }

  function openLibraryItem(item: LibraryItem, intent: "resume" | "replay" | "details") {
    const movie = item.contentType === "MOVIE"
      ? movies.find((entry) => entry.id === item.contentId && entry.playlistId === item.playlistId)
      : undefined;
    const seriesItem = item.contentType === "SERIES"
      ? series.find((entry) => entry.id === item.contentId && entry.playlistId === item.playlistId)
      : undefined;
    if (intent === "details" && movie) {
      onOpenMovie(movie);
      return;
    }
    if (intent === "details" && seriesItem) {
      onOpenSeries(seriesItem);
      return;
    }
    if (item.streamUrl) {
      playLibraryItem(item, intent === "replay" ? 0 : item.positionMillis);
      return;
    }
    if (movie) onOpenMovie(movie);
    else if (seriesItem) onOpenSeries(seriesItem);
    else if (item.contentType === "SERIES") {
      onOpenSeries({
        id: item.contentId,
        playlistId: item.playlistId,
        name: item.title,
        posterUrl: item.artworkUrl,
        seasons: 0,
      });
    }
  }

  function libraryActionLabel(item: LibraryItem, intent: "resume" | "replay" | "details") {
    const hasMovie = item.contentType === "MOVIE" &&
      movies.some((movie) => movie.id === item.contentId && movie.playlistId === item.playlistId);
    const hasSeries = item.contentType === "SERIES" &&
      series.some((entry) => entry.id === item.contentId && entry.playlistId === item.playlistId);

    if (intent === "resume") return item.streamUrl ? t("home.resume") : t("home.unavailable");
    if (intent === "replay") {
      if (item.streamUrl) return t("home.replay");
      return hasMovie || hasSeries || item.contentType === "SERIES" ? t("home.viewDetails") : t("home.unavailable");
    }
    if (hasMovie || hasSeries || (!item.streamUrl && item.contentType === "SERIES")) return t("home.viewDetails");
    return item.streamUrl ? t("player.play") : t("home.unavailable");
  }

  function openFavorite(favorite: Favorite) {
    const movie = favorite.contentType === "MOVIE"
      ? movies.find((entry) => entry.id === favorite.contentId && entry.playlistId === favorite.playlistId)
      : undefined;
    const seriesItem = favorite.contentType === "SERIES"
      ? series.find((entry) => entry.id === favorite.contentId && entry.playlistId === favorite.playlistId)
      : undefined;
    if (movie) {
      onOpenMovie(movie);
      return;
    }
    if (seriesItem) {
      onOpenSeries(seriesItem);
      return;
    }
    if (favorite.contentType === "SERIES") {
      onOpenSeries({
        id: favorite.contentId,
        playlistId: favorite.playlistId,
        name: favorite.title,
        posterUrl: favorite.artworkUrl,
        seasons: 0,
      });
      return;
    }
    if (favorite.streamUrl) {
      onPlay({
        id: favorite.contentId,
        playlistId: favorite.playlistId,
        contentType: favorite.contentType,
        title: favorite.title,
        streamUrl: favorite.streamUrl,
        artworkUrl: favorite.artworkUrl,
        drmLicenseUrl: favorite.drmLicenseUrl,
        drmSystem: favorite.drmSystem,
        live: favorite.contentType === "LIVE",
      }, 0);
    }
  }

  function favoriteActionLabel(favorite: Favorite) {
    if (favorite.contentType === "LIVE") return favorite.streamUrl ? t("home.watchLive") : t("home.unavailable");
    if (favorite.contentType === "SERIES") return t("home.viewDetails");
    if (favorite.contentType === "MOVIE" && movies.some((movie) =>
      movie.id === favorite.contentId && movie.playlistId === favorite.playlistId,
    )) return t("home.viewDetails");
    return favorite.streamUrl ? t("player.play") : t("home.unavailable");
  }

  function renderFavoriteCards(items: Favorite[]) {
    return items.map((favorite) => (
      <HomeTitleCard
        actionLabel={favoriteActionLabel(favorite)}
        detail={homeContentTypeLabel(favorite.contentType)}
        disabled={favoriteActionLabel(favorite) === t("home.unavailable")}
        icon={favorite.contentType === "LIVE" ? "live_tv" : favorite.contentType === "SERIES" ? "tv" : "movie"}
        image={favorite.artworkUrl}
        key={favorite.id}
        onClick={() => openFavorite(favorite)}
        title={favorite.title}
        wide={favorite.contentType === "LIVE"}
      />
    ));
  }

  function renderHomeShelf(key: HomeShelfKey): ReactNode {
    switch (key) {
      case "continueWatching":
        return continueWatching.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={watchingCount}
            eyebrow={t("home.eyebrowPickUp")}
            onMore={() => onNavigate("Library")}
            title={t("library.tabContinue")}
          >
            {continueWatching.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "resume")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "resume") === t("home.unavailable")}
                icon={item.contentType === "LIVE" ? "live_tv" : item.contentType === "SERIES" || item.contentType === "EPISODE" ? "tv" : "movie"}
                image={item.artworkUrl}
                key={item.id}
                onClick={() => playLibraryItem(item)}
                progress={item.durationMillis > 0
                  ? Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100))
                  : undefined}
                title={item.title}
                wide={item.contentType === "LIVE"}
              />
            ))}
          </HomeShelf>
        ) : null;
      case "watchedChannels":
        return watchedChannels.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={library.filter((item) => item.status === "WATCHED" && item.contentType === "LIVE").length}
            eyebrow={t("home.eyebrowLastTv")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfWatchedChannels")}
          >
            {watchedChannels.map((item) => (
              <HomeTitleCard
                actionLabel={item.streamUrl ? t("home.watchLive") : t("home.unavailable")}
                detail={t("nav.liveTv")}
                disabled={!item.streamUrl}
                icon="live_tv"
                image={item.artworkUrl}
                key={item.id}
                onClick={() => playLibraryItem(item, 0)}
                title={item.title}
                wide
              />
            ))}
          </HomeShelf>
        ) : null;
      case "recentlyWatched":
        return recentlyWatched.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={library.filter((item) => item.status === "WATCHED").length}
            eyebrow={t("home.eyebrowHistory")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfRecent")}
          >
            {recentlyWatched.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "replay")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "replay") === t("home.unavailable")}
                icon={item.contentType === "LIVE" ? "live_tv" : item.contentType === "SERIES" || item.contentType === "EPISODE" ? "tv" : "movie"}
                image={item.artworkUrl}
                key={item.id}
                onClick={() => openLibraryItem(item, "replay")}
                title={item.title}
                wide={item.contentType === "LIVE"}
              />
            ))}
          </HomeShelf>
        ) : null;
      case "favoriteMovies":
        return favoriteMovies.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={favoriteMovieCount}
            eyebrow={t("home.eyebrowSaved")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfFavMovies")}
          >
            {renderFavoriteCards(favoriteMovies)}
          </HomeShelf>
        ) : null;
      case "favoriteSeries":
        return favoriteSeries.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={favoriteSeriesCount}
            eyebrow={t("home.eyebrowSaved")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfFavSeries")}
          >
            {renderFavoriteCards(favoriteSeries)}
          </HomeShelf>
        ) : null;
      case "favoriteChannels":
        return favoriteChannels.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={favoriteChannelCount}
            eyebrow={t("home.eyebrowSaved")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfFavChannels")}
          >
            {renderFavoriteCards(favoriteChannels)}
          </HomeShelf>
        ) : null;
      case "watchlist":
        return watchlist.length > 0 ? (
          <HomeShelf
            actionLabel={t("home.manageAll")}
            count={library.filter((item) => item.status === "WATCHLIST").length}
            eyebrow={t("home.eyebrowLater")}
            onMore={() => onNavigate("Library")}
            title={t("home.shelfWatchlist")}
          >
            {watchlist.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "details")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "details") === t("home.unavailable")}
                icon={item.contentType === "SERIES" ? "tv" : "movie"}
                image={item.artworkUrl}
                key={item.id}
                onClick={() => openLibraryItem(item, "details")}
                title={item.title}
              />
            ))}
          </HomeShelf>
        ) : null;
    }
  }

  const featuredResume = homeLayout.hidden.includes("continueWatching")
    ? undefined
    : continueWatching.find((item) => item.streamUrl && item.contentType !== "LIVE");
  const featuredResumeProgress = featuredResume && featuredResume.durationMillis > 0
    ? Math.max(0, Math.min(100, featuredResume.positionMillis / featuredResume.durationMillis * 100))
    : 0;

  if (library.length === 0 && favorites.length === 0) {
    return (
      <HomeEmptyState
        actionIcon="play_arrow"
        actionLabel={t("home.exploreAction")}
        description={t("home.emptyDesc")}
        eyebrow={t("home.eyebrowHome")}
        onAction={() => onNavigate(
          movies.length > 0 ? "Movies" : series.length > 0 ? "Series" : channels.length > 0 ? "Live TV" : "Movies",
        )}
        title={t("home.emptyTitle")}
      />
    );
  }

  return (
    <section className="media-home">
      <header className="page-intro home-page-intro">
        <p className="eyebrow">{t("home.eyebrowHome")}</p>
        <h1>{t("nav.home")}</h1>
        <p>{t("home.intro")}</p>
      </header>
      {featuredResume && (
        <article className="home-resume">
          <span className="home-resume-art">
            <span className="catalog-artwork-fallback"><Icon name={featuredResume.contentType === "LIVE" ? "live_tv" : featuredResume.contentType === "MOVIE" ? "movie" : "tv"} /></span>
            {featuredResume.artworkUrl && <img alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} src={featuredResume.artworkUrl} />}
          </span>
          <div className="home-resume-copy">
            <strong>{featuredResume.title}</strong>
            <small>
              {homeContentTypeLabel(featuredResume.contentType)}
              {featuredResume.parentTitle ? ` · ${featuredResume.parentTitle}` : ""}
              {featuredResume.durationMillis > 0 ? ` · ${t("home.percentWatched", { percent: Math.round(featuredResumeProgress) })}` : ""}
            </small>
            {featuredResume.durationMillis > 0 && (
              <span className="library-progress"><span style={{ width: `${featuredResumeProgress}%` }} /></span>
            )}
          </div>
          <button className="primary-button" onClick={() => playLibraryItem(featuredResume)} type="button">
            <Icon name="play_arrow" />
            {t("home.resume")}
          </button>
        </article>
      )}
      {homeLayout.order.map((key) => (
        <Fragment key={key}>
          {homeLayout.hidden.includes(key) ? null : renderHomeShelf(key)}
        </Fragment>
      ))}
      <div className="home-layout-footer">
        <button
          aria-controls="home-layout-editor"
          aria-expanded={homeEditorOpen}
          className="secondary-button home-layout-toggle"
          onClick={() => setHomeEditorOpen((open) => !open)}
          type="button"
        >
          <Icon name={homeEditorOpen ? "close" : "edit"} />
          {homeEditorOpen ? t("home.doneEditing") : t("home.editHome")}
        </button>
      </div>
      <section
        aria-labelledby="home-layout-editor-title"
        className="home-layout-editor"
        hidden={!homeEditorOpen}
        id="home-layout-editor"
      >
        <div className="home-layout-editor-heading">
          <div>
            <h2 id="home-layout-editor-title">{t("home.customize")}</h2>
            <p>{t("home.customizeDesc")}</p>
          </div>
          <button className="text-button" onClick={resetHomeLayout} type="button">{t("home.reset")}</button>
        </div>
        <ol className="home-layout-editor-list">
          {homeLayout.order.map((key, index) => (
            <li className="home-layout-editor-row" key={key}>
              <label>
                <input
                  checked={!homeLayout.hidden.includes(key)}
                  onChange={() => toggleHomeShelf(key)}
                  type="checkbox"
                />
                <span>{t(HOME_SHELF_LABELS[key])}</span>
              </label>
              <div>
                <button
                  aria-label={t("home.moveUp", { name: t(HOME_SHELF_LABELS[key]) })}
                  className="icon-button home-layout-move-button move-up"
                  disabled={index === 0}
                  onClick={() => moveHomeShelf(key, -1)}
                  type="button"
                >
                  <Icon name="chevron_left" />
                </button>
                <button
                  aria-label={t("home.moveDown", { name: t(HOME_SHELF_LABELS[key]) })}
                  className="icon-button home-layout-move-button move-down"
                  disabled={index === homeLayout.order.length - 1}
                  onClick={() => moveHomeShelf(key, 1)}
                  type="button"
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function homeContentTypeLabel(contentType: ContentType): string {
  const labels: Record<ContentType, string> = {
    LIVE: t("nav.liveTv"),
    MOVIE: t("card.kindMovie"),
    SERIES: t("card.kindSeries"),
    EPISODE: t("downloads.kindEpisode"),
  };
  return labels[contentType];
}

function HomeShelf({
  title,
  eyebrow,
  onMore,
  count,
  actionLabel = t("home.seeAll"),
  children,
}: {
  title: string;
  eyebrow: string;
  onMore: () => void;
  count?: number;
  actionLabel?: string;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [visibleCardCount, setVisibleCardCount] = useState(0);
  const cards = Children.toArray(children);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const updateVisibleCardCount = () => {
      const columns = getComputedStyle(track).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      if (columns > 0) setVisibleCardCount(columns);
    };

    updateVisibleCardCount();
    const observer = new ResizeObserver(updateVisibleCardCount);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="home-shelf">
      <div className="home-shelf-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}{count !== undefined && <span className="home-shelf-count">{count}</span>}</h2>
        </div>
        <button className="text-button" onClick={onMore} type="button">{actionLabel} <Icon name="arrow_forward" /></button>
      </div>
      <div className="home-shelf-grid" ref={trackRef}>
        {cards.slice(0, visibleCardCount)}
      </div>
    </section>
  );
}

function HomeTitleCard({
  title,
  actionLabel,
  detail,
  image,
  icon,
  onClick,
  progress,
  wide = false,
  disabled = false,
}: {
  title: string;
  actionLabel: string;
  detail: string;
  image?: string;
  icon: IconName;
  onClick: () => void;
  progress?: number;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={`${actionLabel} ${title}`}
      className={`catalog-card home-title-card${wide ? " wide-title-card" : ""}`}
      data-tooltip={`${actionLabel} ${title}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="home-title-art">
        <span aria-hidden="true" className="catalog-artwork-fallback"><Icon name={icon} /></span>
        {image && <img alt="" draggable={false} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={image} />}
        <span aria-hidden="true" className="home-card-play">
          <Icon name={actionLabel === t("home.viewDetails") ? "arrow_forward" : "play_arrow"} />
          <span>{actionLabel}</span>
        </span>
        {progress !== undefined && (
          <span className="home-card-progress">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
        <span className="catalog-card-copy">
          <strong data-tooltip={title}>{title}</strong>
          <small data-tooltip={detail}>{detail}</small>
          {disabled && <span className="home-title-action">{actionLabel}</span>}
        </span>
    </button>
  );
}

function Highlight({ icon, label, detail }: { icon: IconName; label: string; detail: string }) {
  return (
    <div className="highlight">
      <div className="highlight-icon"><Icon name={icon} /></div>
      <div><p>{label}</p><span>{detail}</span></div>
    </div>
  );
}

