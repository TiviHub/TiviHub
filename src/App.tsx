import { Children, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import webPackage from "../package.json";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useDownloads } from "./hooks/useDownloads";
import { useLocalData } from "./hooks/useLocalData";
import { useLibrary } from "./hooks/useLibrary";
import { useGlobalSearch } from "./hooks/useGlobalSearch";
import { useSources } from "./hooks/useSources";
import { useNotifications } from "./hooks/useNotifications";
import { isAdultContent } from "./adultContent";
import { getCatalogImportLogSnapshot } from "./catalogImportLog";
import { getDiagnosticLogSnapshot } from "./diagnosticLog";
import {
  isPlaylistExpired,
} from "./catalogCache";
import type { SearchSection } from "./globalSearch";
import { visibleButton } from "./visibleButton";
import {
  loadXtreamEpisodes,
} from "./providers/xtream";
import {
  getEpisodes,
  getLibraryItems,
  getMdblistApiKey,
  getMdblistPopularCacheEntry,
  getMdblistRateLimitState,
  getRatingsCacheEntry,
  saveMdblistApiKey,
  saveMdblistPopularCacheEntry,
  saveMdblistRateLimitState,
  saveRatingsCacheEntry,
  saveEpisodes,
  saveLibraryItem,
  saveOpenSubtitlesApiKey,
} from "./storage/database";
import type {
  ContentType,
  Episode,
  Favorite,
  LibraryItem,
  LiveChannel,
  Movie,
  PlayableItem,
  Playlist,
  Series,
} from "./types";
import { createRatingsService } from "./ratingsService";
import { createPopularCatalogService } from "./popularCatalogService";
import { configureMdblistRateLimiter } from "./mdblistRateLimit";
import { CatalogPage, LibraryPage, MovieDetail, playableChannel, SeriesDetail } from "./components/ContentPages";
import { Icon, TooltipLayer, type IconName } from "./components/common";
import { MobileNav, Sidebar, Topbar } from "./components/AppShell";
import { DownloadsPage } from "./components/DownloadsPage";
import { HomeEmptyState } from "./components/HomeEmptyState";
import { LiveGuide } from "./components/LiveGuide";
import { NoSourceEmptyState } from "./components/NoSourceEmptyState";
import { GlobalSearchDialog } from "./components/GlobalSearchDialog";
import { PlaybackDialog } from "./components/PlaybackDialog";
import { PlaylistDeletionProgress } from "./components/PlaylistDeletionProgress";
import { ProgressIndicator } from "./components/ProgressIndicator";
import { PlaylistDialog } from "./components/PlaylistDialog";
import { SettingsPage } from "./components/SettingsPage";
import { StartupScreen } from "./components/StartupScreen";
import { StreamHealthCheckDialog } from "./components/StreamHealthCheckDialog";

type Section = SearchSection;
type ThemePreference = "system" | "light" | "dark";
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
const HOME_SHELF_LABELS: Record<HomeShelfKey, string> = {
  continueWatching: "Continue watching",
  watchedChannels: "Recently watched channels",
  recentlyWatched: "Recently watched movies and series",
  favoriteMovies: "Favorite movies",
  favoriteSeries: "Favorite series",
  favoriteChannels: "Favorite TV channels",
  watchlist: "Your watchlist",
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

type NavigationEntry = {
  section: Section;
  movieId: string | null;
  moviePlaylistId: string | null;
  seriesId: string | null;
  seriesPlaylistId: string | null;
};
const ratingsService = createRatingsService({
  cache: { get: getRatingsCacheEntry, put: saveRatingsCacheEntry },
  getApiKey: getMdblistApiKey,
});
const popularCatalogService = createPopularCatalogService({
  cache: { get: getMdblistPopularCacheEntry, put: saveMdblistPopularCacheEntry },
});
configureMdblistRateLimiter({
  get: () => getMdblistRateLimitState("account"),
  put: saveMdblistRateLimitState,
});
const ASSET_BASE_URL = import.meta.env.BASE_URL;

function readThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem("tivihub.web.theme");
    return saved === "system" || saved === "light" || saved === "dark" ? saved : "dark";
  } catch (error) {
    console.error("Could not read the local theme preference", error);
    return "dark";
  }
}

function readShowAdultContent(): boolean {
  try {
    return window.localStorage.getItem("tivihub.web.show-adult-content") === "true";
  } catch (error) {
    console.error("Could not read the local adult-content preference", error);
    return false;
  }
}


function App() {
  const isDesktopApp = isTauri();
  const [section, setSection] = useState<Section>("Home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showAdultContent, setShowAdultContent] = useState(readShowAdultContent);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [guideLoadCount, setGuideLoadCount] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [streamHealthRequest, setStreamHealthRequest] = useState<{
    channels: LiveChannel[];
    groupName: string;
  } | null>(null);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [playableItem, setPlayableItem] = useState<PlayableItem | null>(null);
  const [inlineLivePlayback, setInlineLivePlayback] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Playlist | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSource, setDeletingSource] = useState<{
    name: string;
    completed: number;
    total: number;
    phase: "preparing" | "deleting" | "updating";
  } | null>(null);
  const [animateStartup] = useState(
    () => isDesktopApp && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const { error, notice, notificationKey, notify, clearNotifications } = useNotifications();
  const {
    favorites, library, setFavorites, setLibrary, toggleFavorite, addToWatchlist, saveProgress,
    changeLibraryStatus, deleteLibraryItem, removeFromLibrary, removeFavorite,
  } = useLibrary(notify);
  const {
    sources, activeSourceId, channels, movies, series, epg, setEpg, subtitleApiKey, setSubtitleApiKey,
    mdblistApiKey, setMdblistApiKey, ready, reloadLocalData,
  } = useLocalData({ notify, setFavorites, setLibrary });
  const {
    downloads, downloadTasks, downloadDirectoryPath, downloadsLoaded, downloadedIds, activeDownloadIds,
    startDownload, cancelDownload, removeFailedDownload, deleteDownload, clearDownloads,
    changeDownloadDirectory, playDownload,
  } = useDownloads({ notify, openPlayback });
  const [expiredSourceIds, setExpiredSourceIds] = useState<Set<string>>(() => new Set());
  const [expiryCheckTime, setExpiryCheckTime] = useState(() => Date.now());
  const { availableUpdate, updateStatus, checkUpdates, openAvailableUpdate } = useAppUpdate(isDesktopApp);
  const requestedEpgChannels = useRef(new Set<string>());
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const startupOverlayRef = useRef<HTMLDivElement>(null);
  const refreshOverlayRef = useRef<HTMLDivElement>(null);
  const refreshReturnFocusRef = useRef<HTMLElement | null>(null);
  const catalogRefreshInFlight = useRef(new Set<string>());
  const navigationHistoryRef = useRef<NavigationEntry[]>([]);
  const navigationHistoryIndexRef = useRef(-1);
  const navigationKeyRef = useRef<string | null>(null);
  const navigationActionRef = useRef<(direction: -1 | 1) => void>(() => undefined);

  useLayoutEffect(() => {
    if (!selectedMovie && !selectedSeries) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [selectedMovie, selectedSeries]);

  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [section]);

  useLayoutEffect(() => {
    if (!ready) return;
    const entry: NavigationEntry = {
      section,
      movieId: section === "Movies" ? selectedMovie?.id ?? null : null,
      moviePlaylistId: section === "Movies" ? selectedMovie?.playlistId ?? null : null,
      seriesId: section === "Series" ? selectedSeries?.id ?? null : null,
      seriesPlaylistId: section === "Series" ? selectedSeries?.playlistId ?? null : null,
    };
    const key = JSON.stringify(entry);
    if (navigationKeyRef.current === key) return;

    const history = navigationHistoryRef.current;
    history.splice(navigationHistoryIndexRef.current + 1);
    history.push(entry);
    if (history.length > 50) history.shift();
    navigationHistoryIndexRef.current = history.length - 1;
    navigationKeyRef.current = key;
  }, [ready, section, selectedMovie?.id, selectedMovie?.playlistId, selectedSeries?.id, selectedSeries?.playlistId]);

  useEffect(() => {
    const handleAuxClick = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigationActionRef.current(event.button === 3 ? -1 : 1);
    };
    window.addEventListener("auxclick", handleAuxClick, true);
    return () => window.removeEventListener("auxclick", handleAuxClick, true);
  }, []);

  const activeSource = sources.find((source) => source.id === activeSourceId) ?? null;
  const activeSourceExpired = Boolean(activeSource && (
    isPlaylistExpired(activeSource, expiryCheckTime) || expiredSourceIds.has(activeSource.id)
  ));
  const blockingDialogOpen = sourceDialogOpen ||
    Boolean(playableItem && !(inlineLivePlayback && playableItem.live)) ||
    Boolean(streamHealthRequest);
  const canOpenGlobalSearch = ready &&
    !refreshing &&
    !sourceDialogOpen &&
    (!playableItem || (inlineLivePlayback && playableItem.live));

  const {
    activateSource, connectSource, loadDemoLibrary, loadGuideForChannels, refreshCurrentSource, refreshGuide,
    removeSource,
  } = useSources({
    activeSource, activeSourceId, activeSourceIdRef, catalogRefreshInFlight, channels, clearNotifications, epg,
    expiredSourceIds, notify, ready, refreshReturnFocusRef, reloadLocalData, requestedEpgChannels, setDeletingSource,
    setEpg, setEpisodes, setExpiredSourceIds, setGuideLoadCount, setRefreshing, setSection, setSelectedSeries, sources,
  });

  const { globalSearchOpen, openGlobalSearch, closeGlobalSearch, runGlobalSearchCommand, openGlobalSearchResult } =
    useGlobalSearch({
      canOpen: canOpenGlobalSearch,
      openAddSource,
      openPlayback,
      openSeries,
      refreshCurrentSource,
      setEpisodeError,
      setEpisodes,
      setSection,
      setSelectedMovie,
      setSelectedSeries,
    });

  useEffect(() => {
    const expiresAtMillis = activeSource?.expiresAtMillis;
    if (expiresAtMillis === undefined || expiresAtMillis <= expiryCheckTime) return;
    const timer = window.setTimeout(
      () => setExpiryCheckTime(Date.now()),
      Math.min(expiresAtMillis - expiryCheckTime, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [activeSource?.expiresAtMillis, activeSource?.id, expiryCheckTime]);

  useEffect(() => {
    if (!ready) startupOverlayRef.current?.focus();
  }, [ready]);

  async function openExternalUrl(url: string) {
    try {
      await openUrl(url);
    } catch (cause) {
      console.error("Could not open the external website", cause);
      notify("Could not open the external website.", "error");
    }
  }

  async function downloadDiagnostics(): Promise<boolean> {
    const localDiagnostics = getDiagnosticLogSnapshot();
    const catalogImports = getCatalogImportLogSnapshot();
    const backendErrors = isDesktopApp
      ? await invoke<Array<{ component: string; code: string }>>("get_backend_diagnostics")
      : [];
    const report = {
      format: "tivihub-diagnostics-v2",
      generatedAt: new Date().toISOString(),
      appVersion: webPackage.version,
      runtime: isDesktopApp ? "TiviHub desktop app" : "TiviHub browser preview",
      privacy: "This file contains sanitized error categories and catalog-import counts/timings only. It excludes media titles, source names, URLs, credentials, raw messages, and stack traces.",
      localLogStorageAvailable: localDiagnostics.storageAvailable && catalogImports.storageAvailable,
      frontendErrors: localDiagnostics.entries,
      catalogImports: catalogImports.entries,
      backendErrors,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tivihub-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return localDiagnostics.storageAvailable;
  }

  useEffect(() => {
    if (refreshing) {
      refreshOverlayRef.current?.focus();
      return;
    }
    const returnFocus = refreshReturnFocusRef.current;
    if (!returnFocus) return;
    refreshReturnFocusRef.current = null;
    if (returnFocus.isConnected) returnFocus.focus();
    else visibleButton(".settings-source-refresh")?.focus();
  }, [refreshing]);

  useEffect(() => {
    if (!refreshing) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [refreshing]);

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = theme === "system" ? systemTheme.matches : theme === "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        dark ? "#09080f" : "#f8f8fa",
      );
    };
    applyTheme();
    if (theme !== "system") return;
    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [theme]);

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    try {
      window.localStorage.setItem("tivihub.web.theme", value);
    } catch (cause) {
      console.error("Could not save the local theme preference", cause);
      notify("Could not save the theme preference on this device.", "error");
    }
  }

  function chooseShowAdultContent(value: boolean) {
    setShowAdultContent(value);
    try {
      window.localStorage.setItem("tivihub.web.show-adult-content", String(value));
    } catch (cause) {
      console.error("Could not save the local adult-content preference", cause);
      notify("Could not save the adult-content preference on this device.", "error");
    }
  }

  function openAddSource() {
    setEditingSource(undefined);
    setSourceDialogOpen(true);
  }

  function openExpiredPlaylist() {
    if (!activeSource) return;
    setEditingSource(activeSource);
    setSourceDialogOpen(true);
  }

  async function saveApiKey(value: string) {
    await saveOpenSubtitlesApiKey(value);
    setSubtitleApiKey(value.trim());
  }

  async function saveMdblistKey(value: string) {
    await saveMdblistApiKey(value);
    setMdblistApiKey(value.trim());
  }

  async function onDataRestored() {
    await reloadLocalData();
    setSelectedSeries(null);
    setEpisodes([]);
  }

  async function openSeries(item: Series) {
    navigateToSection("Series");
    setSelectedSeries(item);
    setSelectedMovie(null);
    setEpisodes([]);
    setEpisodeError(null);
    setEpisodeLoading(true);
    try {
      let savedEpisodes = await getEpisodes(item.playlistId, item.id);
      if (savedEpisodes.length === 0) {
        const source = sources.find((entry) => entry.id === item.playlistId);
        if (!source || source.type !== "XTREAM") {
          throw new Error("Episode details are available only when the source provides series episodes.");
        }
        savedEpisodes = await loadXtreamEpisodes(source, item);
        await saveEpisodes(item.playlistId, item.id, savedEpisodes);
      }
      setEpisodes(savedEpisodes);
    } catch (cause) {
      setEpisodeError(cause instanceof Error ? cause.message : "Could not load episode details.");
    } finally {
      setEpisodeLoading(false);
    }
  }

  // Offline blob URLs are revoked only when the player leaves; the player effect re-runs on seek/resume.
  function revokeOfflineUrl() {
    if (playableItem?.offline) URL.revokeObjectURL(playableItem.streamUrl);
  }

  function openPlayback(item: PlayableItem, position = 0) {
    revokeOfflineUrl();
    setResumePosition(position);
    setInlineLivePlayback(item.live);
    const source = sources.find((entry) => entry.id === item.playlistId);
    setPlayableItem({
      ...item,
      drmCertificateUrl: item.drmCertificateUrl || source?.drmCertificateUrl,
    });
  }

  function navigateToSection(next: Section) {
    setSection(next);
  }

  function navigateAppHistory(direction: -1 | 1) {
    const nextIndex = navigationHistoryIndexRef.current + direction;
    const history = navigationHistoryRef.current;
    if (nextIndex < 0 || nextIndex >= history.length) return;

    const entry = history[nextIndex];
    navigationHistoryIndexRef.current = nextIndex;
    navigationKeyRef.current = JSON.stringify(entry);

    if (entry.seriesId) {
      const targetSeries = series.find((item) =>
        item.id === entry.seriesId && item.playlistId === entry.seriesPlaylistId,
      );
      if (targetSeries) {
        void openSeries(targetSeries);
        return;
      }
    }

    setSection(entry.section);
    setSelectedSeries(null);
    setSelectedMovie(entry.movieId
      ? movies.find((item) => item.id === entry.movieId && item.playlistId === entry.moviePlaylistId) ?? null
      : null);
    setEpisodes([]);
    setEpisodeError(null);
    setEpisodeLoading(false);
  }

  navigationActionRef.current = navigateAppHistory;

  function closePlayback() {
    revokeOfflineUrl();
    setPlayableItem(null);
    setInlineLivePlayback(false);
  }

  async function recordWatchedChannel(item: PlayableItem) {
    if (!item.live) return;
    try {
      await saveLibraryItem({
        id: `${item.playlistId}:LIVE:${item.id}`,
        contentId: item.id,
        contentType: "LIVE",
        playlistId: item.playlistId,
        title: item.title,
        streamUrl: item.streamUrl,
        artworkUrl: item.artworkUrl,
        drmLicenseUrl: item.drmLicenseUrl,
        drmSystem: item.drmSystem,
        status: "WATCHED",
        positionMillis: 0,
        durationMillis: 0,
        updatedAt: Date.now(),
      });
      setLibrary(await getLibraryItems());
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : `Could not save ${item.title} to recently watched channels.`, "error");
    }
  }

  const adultContentIds = {
    LIVE: new Set(channels.filter((item) => isAdultContent(item.name, item.group)).map((item) => item.id)),
    MOVIE: new Set(movies.filter((item) => isAdultContent(item.name, item.category)).map((item) => item.id)),
    SERIES: new Set(series.filter((item) => isAdultContent(item.name, item.category)).map((item) => item.id)),
  };
  function isAdultSavedContent(
    contentType: ContentType,
    contentId: string,
    title: string,
    parentId?: string,
    parentTitle?: string,
  ): boolean {
    const catalogType = contentType === "EPISODE" ? "SERIES" : contentType;
    return adultContentIds[catalogType].has(contentId) ||
      (contentType === "EPISODE" && adultContentIds.SERIES.has(parentId ?? "")) ||
      isAdultContent(title, parentTitle);
  }
  const visibleChannels = showAdultContent
    ? channels
    : channels.filter((item) => !isAdultContent(item.name, item.group));
  const visibleMovies = useMemo(
    () => showAdultContent ? movies : movies.filter((item) => !isAdultContent(item.name, item.category)),
    [movies, showAdultContent],
  );
  const visibleSeries = useMemo(
    () => showAdultContent ? series : series.filter((item) => !isAdultContent(item.name, item.category)),
    [series, showAdultContent],
  );
  const visibleEpisodes = showAdultContent
    ? episodes
    : episodes.filter((item) => !isAdultContent(item.name));
  const visibleEpg = showAdultContent
    ? epg
    : epg.filter((item) => !isAdultContent(item.title));
  const visibleLibrary = showAdultContent
    ? library
    : library.filter((item) =>
      !isAdultSavedContent(item.contentType, item.contentId, item.title, item.parentId, item.parentTitle),
    );
  const visibleFavorites = showAdultContent
    ? favorites
    : favorites.filter((item) =>
      !isAdultSavedContent(item.contentType, item.contentId, item.title),
    );
  const continueWatching = visibleLibrary
    .filter((item) => item.status === "WATCHING")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  const movieProgress = selectedMovie
    ? visibleLibrary
      .filter((item) =>
      item.contentId === selectedMovie.id &&
      item.contentType === "MOVIE" &&
      item.status === "WATCHING",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined;
  const seriesEpisodeProgress = selectedSeries
    ? visibleLibrary
      .filter((item) =>
      item.playlistId === selectedSeries.playlistId &&
      item.contentType === "EPISODE" &&
      item.parentId === selectedSeries.id &&
      item.status === "WATCHING" &&
      Boolean(item.streamUrl),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined;

  return (
    <>
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${isDesktopApp ? " desktop-app" : ""}`}
      inert={!ready}
    >
      <TooltipLayer />
      <Sidebar
        activeDownloads={activeDownloadIds.size > 0}
        collapsed={sidebarCollapsed}
        inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}
        onNavigate={navigateToSection}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        section={section}
      />

      <main className="main-content" inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}>
        <Topbar
          activeSourceExpired={activeSourceExpired}
          activeSourceName={activeSource?.name}
          canOpenGlobalSearch={canOpenGlobalSearch}
          canRefresh={Boolean(activeSource) && !refreshing && !sourceDialogOpen}
          canAdd={!refreshing && !sourceDialogOpen}
          onAddSource={openAddSource}
          onNavigate={navigateToSection}
          onOpenExpiredPlaylist={openExpiredPlaylist}
          onOpenGlobalSearch={openGlobalSearch}
          onRefresh={() => void refreshCurrentSource()}
          section={section}
        />
        {activeSourceExpired && (
          <button
            className="topbar-expiry-warning topbar-expiry-floating"
            onClick={openExpiredPlaylist}
            type="button"
          >
            <Icon name="error_outline" />
            <span>Playlist expired</span>
          </button>
        )}

        {ready && (
          <>
            {activeSource && (section === "Live TV" || (inlineLivePlayback && playableItem?.live)) && (
              <div
                key={activeSourceId ?? "no-active-source"}
                className={`live-tv-persistent${section === "Live TV" ? "" : " is-mini"}`}
              >
                <CatalogPage
                  channels={visibleChannels}
                  epg={visibleEpg}
                  favorites={visibleFavorites}
                  guideLoading={guideLoadCount > 0}
                  library={visibleLibrary}
                  livePlaybackItemId={inlineLivePlayback && playableItem?.live ? playableItem.id : undefined}
                  livePlayer={inlineLivePlayback && playableItem?.live ? (
                    <PlaybackDialog
                      inline
                      item={playableItem}
                      key={playableItem.id}
                      mini={section !== "Live TV"}
                      onClose={closePlayback}
                      onExpand={() => navigateToSection("Live TV")}
                      onProgress={saveProgress}
                      onStarted={(item) => void recordWatchedChannel(item)}
                      resumePositionMillis={resumePosition}
                      subtitleApiKey={subtitleApiKey}
                    />
                  ) : undefined}
                  livePlayerMini={section !== "Live TV"}
                  loading={refreshing}
                  movies={visibleMovies}
                  onAddToLibrary={(item, type) => void addToWatchlist(item, type)}
                  onCheckStreamGroup={(groupChannels, groupName) => setStreamHealthRequest({
                    channels: groupChannels,
                    groupName,
                  })}
                  onLoadGuideForChannels={(visibleChannels) => void loadGuideForChannels(visibleChannels)}
                  onOpenMovie={(movie) => {
                    setSelectedMovie(movie);
                    setSelectedSeries(null);
                    navigateToSection("Movies");
                  }}
                  onOpenSeries={(item) => void openSeries(item)}
                  onPlay={(item) => openPlayback(item)}
                  onToggleFavorite={(item, type) => void toggleFavorite(item, type)}
                  section="Live TV"
                  series={visibleSeries}
                />
              </div>
            )}
            {section === "Live TV" && !activeSource ? (
              <NoSourceEmptyState onAddSource={openAddSource} />
            ) : section === "Live TV" ? null : section === "Home" ? (
              <Home
                channels={visibleChannels}
                favorites={visibleFavorites}
                library={visibleLibrary}
                movies={visibleMovies}
                series={visibleSeries}
                source={activeSource}
                sourceCount={sources.length}
                continueWatching={continueWatching}
                onAddSource={openAddSource}
                onOpenMovie={(movie) => {
                  setSelectedMovie(movie);
                  setSelectedSeries(null);
                  navigateToSection("Movies");
                }}
                onOpenSeries={(item) => void openSeries(item)}
                onNavigate={navigateToSection}
                onPlay={(item, position) => openPlayback(item, position)}
                onPreferenceError={(message) => notify(message, "error")}
              />
            ) : section === "TV Guide" && !activeSource ? (
              <NoSourceEmptyState onAddSource={openAddSource} />
            ) : section === "TV Guide" ? (
              <LiveGuide
                activeChannelId={inlineLivePlayback && playableItem?.live ? playableItem.id : undefined}
                channels={visibleChannels}
                epg={visibleEpg}
                favoriteIds={new Set(visibleFavorites
                  .filter((favorite) => favorite.contentType === "LIVE")
                  .map((favorite) => favorite.contentId))}
                loading={guideLoadCount > 0}
                onLoadGuideForChannels={(guideChannels) => void loadGuideForChannels(guideChannels)}
                onPlay={(channel) => openPlayback(playableChannel(channel))}
                selectedChannelId={inlineLivePlayback && playableItem?.live ? playableItem.id : undefined}
              />
            ) : section === "Downloads" ? (
              <DownloadsPage
                downloads={downloads}
                tasks={downloadTasks}
                loading={!downloadsLoaded}
                sourceCount={sources.length}
                onDelete={(id, title) => void deleteDownload(id, title)}
                onCancel={(id) => cancelDownload(id)}
                onRemoveFailed={removeFailedDownload}
                onRetry={(task) => void startDownload(task.media)}
                onPlay={(download) => void playDownload(download)}
                onAddPlaylist={openAddSource}
                onBrowseMovies={() => {
                  setSelectedMovie(null);
                  setSelectedSeries(null);
                  navigateToSection("Movies");
                }}
              />
            ) : section === "Settings" ? (
              <SettingsPage
                activeSourceId={activeSourceId}
                onAddSource={openAddSource}
                onDownloadDiagnostics={downloadDiagnostics}
                onRefreshSource={() => void refreshCurrentSource()}
                refreshing={refreshing}
                isDesktopApp={isDesktopApp}
                updateStatus={updateStatus}
                availableUpdateVersion={availableUpdate?.version ?? null}
                onUpdateAction={() => availableUpdate ? void openAvailableUpdate() : void checkUpdates()}
                version={webPackage.version}
                apiKey={subtitleApiKey}
                downloadDirectoryPath={downloadDirectoryPath}
                completedDownloadCount={downloads.length}
                onChangeDownloadDirectory={() => void changeDownloadDirectory()}
                onClearCompletedDownloads={() => void clearDownloads()}
                onActivate={(id) => void activateSource(id)}
                onChooseTheme={chooseTheme}
                onSetShowAdultContent={chooseShowAdultContent}
                onDataRestored={onDataRestored}
                onDelete={(source) => void removeSource(source)}
                onEdit={(source) => {
                  setEditingSource(source);
                  setSourceDialogOpen(true);
                }}
                onRefreshEpg={refreshGuide}
                onSaveApiKey={saveApiKey}
                onOpenExternalUrl={isDesktopApp ? openExternalUrl : undefined}
                mdblistApiKey={mdblistApiKey}
                onSaveMdblistApiKey={saveMdblistKey}
                sources={sources}
                theme={theme}
                showAdultContent={showAdultContent}
              />
            ) : (section === "Movies" || section === "Series") && !activeSource ? (
              <NoSourceEmptyState onAddSource={openAddSource} />
            ) : section === "Movies" && selectedMovie && (showAdultContent || !isAdultContent(selectedMovie.name, selectedMovie.category)) ? (
              <MovieDetail
                favorite={visibleFavorites.some((favorite) => favorite.contentId === selectedMovie.id)}
                inLibrary={visibleLibrary.some((entry) => entry.contentId === selectedMovie.id && entry.contentType === "MOVIE")}
                continueWatching={Boolean(movieProgress)}
                movie={selectedMovie}
                playlistMovies={visibleMovies}
                ratingsService={ratingsService}
                onDownload={startDownload}
                downloadedIds={downloadedIds}
                activeDownloadIds={activeDownloadIds}
                relatedFavoriteIds={new Set(visibleFavorites
                  .filter((favorite) => favorite.contentType === "MOVIE" && favorite.playlistId === selectedMovie.playlistId)
                  .map((favorite) => favorite.contentId))}
                relatedLibraryIds={new Set(visibleLibrary
                  .filter((entry) => entry.contentType === "MOVIE" && entry.playlistId === selectedMovie.playlistId)
                  .map((entry) => entry.contentId))}
                onToggleRelatedFavorite={(item) => void toggleFavorite(item, "MOVIE")}
                onAddRelatedToLibrary={(item) => void addToWatchlist(item, "MOVIE")}
                onOpenMovie={(item) => setSelectedMovie(item)}
                onAddToLibrary={() => void addToWatchlist(selectedMovie, "MOVIE")}
                onBack={() => setSelectedMovie(null)}
                onFavorite={() => void toggleFavorite(selectedMovie, "MOVIE")}
                onRemoveFromLibrary={() => void removeFromLibrary(selectedMovie, "MOVIE")}
                onPlay={() => {
                  openPlayback({
                    id: selectedMovie.id,
                    playlistId: selectedMovie.playlistId,
                    contentType: "MOVIE",
                    title: selectedMovie.name,
                    streamUrl: selectedMovie.streamUrl,
                    artworkUrl: selectedMovie.posterUrl,
                    drmLicenseUrl: selectedMovie.drmLicenseUrl,
                    drmSystem: selectedMovie.drmSystem,
                    live: false,
                  }, movieProgress?.positionMillis ?? 0);
                }}
              />
            ) : section === "Movies" ? (
              <CatalogPage
                key="Movies"
                channels={visibleChannels}
                epg={visibleEpg}
                favorites={visibleFavorites}
                library={visibleLibrary}
                loading={refreshing}
                movies={visibleMovies}
                onAddToLibrary={(item, type) => void addToWatchlist(item, type)}
                onCheckStreamGroup={(groupChannels, groupName) => setStreamHealthRequest({
                  channels: groupChannels,
                  groupName,
                })}
                onLoadGuideForChannels={(visibleChannels) => void loadGuideForChannels(visibleChannels)}
                onOpenMovie={(movie) => {
                  setSelectedMovie(movie);
                  setSelectedSeries(null);
                  navigateToSection("Movies");
                }}
                onOpenSeries={(item) => void openSeries(item)}
                onPlay={(item) => openPlayback(item)}
                onToggleFavorite={(item, type) => void toggleFavorite(item, type)}
                section="Movies"
                series={visibleSeries}
                mdblistApiKey={mdblistApiKey}
                popularCatalogService={popularCatalogService}
              />
            ) : section === "Series" ? (
              selectedSeries && (showAdultContent || !isAdultContent(selectedSeries.name, selectedSeries.category)) ? (
                <SeriesDetail
                  episodes={visibleEpisodes}
                  error={episodeError}
                  favorite={visibleFavorites.some((favorite) => favorite.contentId === selectedSeries.id)}
                  inLibrary={visibleLibrary.some((entry) => entry.contentId === selectedSeries.id && entry.contentType === "SERIES")}
                  continueWatching={Boolean(seriesEpisodeProgress)}
                  loading={episodeLoading}
                  onDownload={startDownload}
                  downloadedIds={downloadedIds}
                  activeDownloadIds={activeDownloadIds}
                  relatedFavoriteIds={new Set(visibleFavorites
                    .filter((favorite) => favorite.contentType === "SERIES" && favorite.playlistId === selectedSeries.playlistId)
                    .map((favorite) => favorite.contentId))}
                  relatedLibraryIds={new Set(visibleLibrary
                    .filter((entry) => entry.contentType === "SERIES" && entry.playlistId === selectedSeries.playlistId)
                    .map((entry) => entry.contentId))}
                  onToggleRelatedFavorite={(item) => void toggleFavorite(item, "SERIES")}
                  onAddRelatedToLibrary={(item) => void addToWatchlist(item, "SERIES")}
                  onBack={() => setSelectedSeries(null)}
                  showAdultContent={showAdultContent}
                  onAddToLibrary={() => void addToWatchlist(selectedSeries, "SERIES")}
                  onRemoveFromLibrary={() => void removeFromLibrary(selectedSeries, "SERIES")}
                  onContinueWatching={() => {
                    if (!seriesEpisodeProgress?.streamUrl) return;
                    openPlayback({
                      id: seriesEpisodeProgress.contentId,
                      playlistId: seriesEpisodeProgress.playlistId,
                      contentType: "EPISODE",
                      title: seriesEpisodeProgress.title,
                      streamUrl: seriesEpisodeProgress.streamUrl,
                      artworkUrl: seriesEpisodeProgress.artworkUrl,
                      drmLicenseUrl: seriesEpisodeProgress.drmLicenseUrl,
                      drmSystem: seriesEpisodeProgress.drmSystem,
                      live: false,
                      parentId: seriesEpisodeProgress.parentId,
                      parentTitle: seriesEpisodeProgress.parentTitle,
                    }, seriesEpisodeProgress.positionMillis);
                  }}
                  onFavorite={() => void toggleFavorite(selectedSeries, "SERIES")}
                  onPlay={(item) => openPlayback(item)}
                  series={selectedSeries}
                  playlistSeries={visibleSeries}
                  ratingsService={ratingsService}
                  onOpenSeries={(item) => void openSeries(item)}
                />
              ) : (
                <CatalogPage
                  key="Series"
                  channels={visibleChannels}
                  epg={visibleEpg}
                  favorites={visibleFavorites}
                  library={visibleLibrary}
                  loading={refreshing}
                  movies={visibleMovies}
                  onAddToLibrary={(item, type) => void addToWatchlist(item, type)}
                  onLoadGuideForChannels={(visibleChannels) => void loadGuideForChannels(visibleChannels)}
                  onOpenMovie={setSelectedMovie}
                  onOpenSeries={(item) => void openSeries(item)}
                  onPlay={(item) => openPlayback(item)}
                  onToggleFavorite={(item, type) => void toggleFavorite(item, type)}
                  section="Series"
                  series={visibleSeries}
                  mdblistApiKey={mdblistApiKey}
                  popularCatalogService={popularCatalogService}
                />
              )
            ) : (
              <LibraryPage
                favorites={visibleFavorites}
                library={visibleLibrary}
                sourceCount={sources.length}
                onAddSource={openAddSource}
                onChangeStatus={(item, status) => void changeLibraryStatus(item, status)}
                onPlay={(item, position) => openPlayback(item, position)}
                onRemove={(id, title) => void deleteLibraryItem(id, title)}
                onRemoveFavorite={(favorite) => void removeFavorite(favorite)}
                onBrowseMovies={() => navigateToSection("Movies")}
                onOpenFavorite={(favorite) => {
                  if (favorite.contentType === "MOVIE") {
                    const movie = visibleMovies.find((item) =>
                      item.id === favorite.contentId && item.playlistId === favorite.playlistId,
                    );
                    if (movie) {
                      navigateToSection("Movies");
                      setSelectedMovie(movie);
                      setSelectedSeries(null);
                    } else {
                      notify("This movie isn't available in the currently loaded catalog.", "error");
                    }
                  } else if (favorite.contentType === "SERIES") {
                    const show = visibleSeries.find((item) =>
                      item.id === favorite.contentId && item.playlistId === favorite.playlistId,
                    );
                    if (show) void openSeries(show);
                    else notify("This series isn't available in the currently loaded catalog.", "error");
                  }
                }}
              />
            )}
          </>
        )}
      </main>

      {(error || notice) && (
        <div aria-live={error ? "assertive" : "polite"} className="notification-stack" inert={refreshing || globalSearchOpen || Boolean(deletingSource)}>
          <div
            className={`app-message notification-toast ${error ? "error-message" : "notice-message"}`}
            key={notificationKey}
            role={error ? "alert" : "status"}
          >
            <Icon name={error ? "error_outline" : "info"} />
            <span>{error ?? notice}</span>
            <button aria-label="Dismiss notification" onClick={clearNotifications} type="button"><Icon name="close" /></button>
          </div>
        </div>
      )}

      <MobileNav
        activeDownloads={activeDownloadIds.size > 0}
        inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}
        onNavigate={navigateToSection}
        section={section}
      />

      {sourceDialogOpen && (
        <div className="refresh-dialog-host" inert={refreshing || globalSearchOpen || Boolean(deletingSource)}>
          <PlaylistDialog
            editing={editingSource}
            onLoadDemo={import.meta.env.DEV ? loadDemoLibrary : undefined}
            onClose={() => {
              setSourceDialogOpen(false);
              setEditingSource(undefined);
            }}
            onConnect={connectSource}
          />
        </div>
      )}
      {playableItem && !(inlineLivePlayback && playableItem.live) && (
        <PlaybackDialog
          item={playableItem}
          onClose={closePlayback}
          onProgress={saveProgress}
          resumePositionMillis={resumePosition}
          subtitleApiKey={subtitleApiKey}
        />
      )}
      {streamHealthRequest && (
        <StreamHealthCheckDialog
          channels={streamHealthRequest.channels}
          groupName={streamHealthRequest.groupName}
          key={`${streamHealthRequest.groupName}:${streamHealthRequest.channels.map((channel) => channel.id).join("|")}`}
          onClose={() => setStreamHealthRequest(null)}
        />
      )}
      {refreshing && (
        <div
          aria-describedby="refresh-progress-description"
          aria-labelledby="refresh-progress-title"
          aria-modal="true"
          className="refresh-overlay"
          ref={refreshOverlayRef}
          role="dialog"
          tabIndex={-1}
        >
          <section className="refresh-progress-card">
            <span aria-hidden="true" className="spinner refresh-progress-spinner" />
            <p className="eyebrow">SOURCE SYNC</p>
            <h2 id="refresh-progress-title">Refreshing your catalog</h2>
            <p id="refresh-progress-description">
              Updating channels, movies, series, and the TV guide. Please wait while the latest data is saved on this device.
            </p>
            <ProgressIndicator label="Source refresh progress" />
          </section>
        </div>
      )}
      {deletingSource && (
        <PlaylistDeletionProgress
          completed={deletingSource.completed}
          name={deletingSource.name}
          phase={deletingSource.phase}
          total={deletingSource.total}
        />
      )}
      {globalSearchOpen && canOpenGlobalSearch && (
        <GlobalSearchDialog
          canRefresh={Boolean(activeSource)}
          channels={channels}
          movies={movies}
          onClose={closeGlobalSearch}
          onRunCommand={runGlobalSearchCommand}
          onSelectResult={openGlobalSearchResult}
          series={series}
          showAdultContent={showAdultContent}
        />
      )}
    </div>
    {!ready && (
      <StartupScreen
        animate={animateStartup}
        logoSrc={`${ASSET_BASE_URL}icons/tivihub.svg`}
        screenRef={startupOverlayRef}
      />
    )}
    </>
  );
}

function Home({
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
    { label: "Live TV", icon: "live_tv", detail: "Channels & guide" },
    { label: "Movies", icon: "movie", detail: "Your cinema" },
    { label: "Series", icon: "tv", detail: "Every episode, in order" },
    { label: "Library", icon: "bookmark", detail: "Keep your place" },
  ];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-mark">✳</span> YOUR MEDIA. YOUR RULES.</p>
          <h1>Tune in to<br /><span className="neon-text">your universe</span></h1>
          <p className="hero-description">
            Your channels, films, and series in one beautifully simple player.
            Bring your own sources and make it yours.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onAddSource} type="button">
              <Icon name="add" />
              Add your first source
              <Icon name="arrow_forward" />
            </button>
            <span className="hero-footnote">{sourceCount ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} on this device` : "No account. No cloud library."}</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
          <div className="orbit-core"><img src={`${ASSET_BASE_URL}icons/tivihub-512.png`} alt="" /></div>
          <span className="orbit-star star-one">✦</span><span className="orbit-star star-two">✧</span>
          <span className="orbit-caption">SIGNAL / 001</span>
        </div>
      </section>

      <section className="privacy-strip" aria-label="Privacy and platform highlights">
        <Highlight icon="devices" label="Made for your screens" detail="Windows desktop" />
        <Highlight icon="shield" label="Local-first library" detail="Saved on this device" />
        <div className="privacy-status"><span className="status-pulse" /><span>NO TIVIHUB APP SERVER</span></div>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div><p className="eyebrow">PICK YOUR FREQUENCY</p><h2>One hub. Every mood.</h2></div>
          <span className="section-index">01 — 04</span>
        </div>
        <div className="feature-grid">
          {destinations.map((destination) => (
            <button className="feature-card" key={destination.label} onClick={() => onNavigate(destination.label)} type="button">
              <span className="feature-icon"><Icon name={destination.icon} /></span>
              <span className="feature-arrow"><Icon name="arrow_forward" /></span>
              <span className="feature-title">{destination.label}</span>
              <span className="feature-detail">{destination.detail}</span>
            </button>
          ))}
        </div>
      </section>

      {continueWatching.length > 0 && (
        <section className="home-continue-section">
          <div className="section-heading">
            <div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Continue watching</h2></div>
            <button className="text-button" onClick={() => onNavigate("Library")} type="button">Open library <Icon name="arrow_forward" /></button>
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
        <span>TIVIHUB DESKTOP <span className="footer-separator">/</span> BUILT FOR YOUR SOURCES</span>
        <span>Bring sources you are authorized to use.</span>
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
      onPreferenceError("Could not save your Home layout on this device.");
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

    if (intent === "resume") return item.streamUrl ? "Resume" : "Unavailable";
    if (intent === "replay") {
      if (item.streamUrl) return "Replay";
      return hasMovie || hasSeries || item.contentType === "SERIES" ? "View details" : "Unavailable";
    }
    if (hasMovie || hasSeries || (!item.streamUrl && item.contentType === "SERIES")) return "View details";
    return item.streamUrl ? "Play" : "Unavailable";
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
    if (favorite.contentType === "LIVE") return favorite.streamUrl ? "Watch live" : "Unavailable";
    if (favorite.contentType === "SERIES") return "View details";
    if (favorite.contentType === "MOVIE" && movies.some((movie) =>
      movie.id === favorite.contentId && movie.playlistId === favorite.playlistId,
    )) return "View details";
    return favorite.streamUrl ? "Play" : "Unavailable";
  }

  function renderFavoriteCards(items: Favorite[]) {
    return items.map((favorite) => (
      <HomeTitleCard
        actionLabel={favoriteActionLabel(favorite)}
        detail={homeContentTypeLabel(favorite.contentType)}
        disabled={favoriteActionLabel(favorite) === "Unavailable"}
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
            actionLabel="Manage all"
            count={watchingCount}
            eyebrow="PICK UP WHERE YOU LEFT OFF"
            onMore={() => onNavigate("Library")}
            title="Continue watching"
          >
            {continueWatching.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "resume")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "resume") === "Unavailable"}
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
            actionLabel="Manage all"
            count={library.filter((item) => item.status === "WATCHED" && item.contentType === "LIVE").length}
            eyebrow="LAST WATCHED TV"
            onMore={() => onNavigate("Library")}
            title="Recently watched channels"
          >
            {watchedChannels.map((item) => (
              <HomeTitleCard
                actionLabel={item.streamUrl ? "Watch live" : "Unavailable"}
                detail="Live TV"
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
            actionLabel="Manage all"
            count={library.filter((item) => item.status === "WATCHED").length}
            eyebrow="YOUR RECENT HISTORY"
            onMore={() => onNavigate("Library")}
            title="Recently watched"
          >
            {recentlyWatched.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "replay")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "replay") === "Unavailable"}
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
            actionLabel="Manage all"
            count={favoriteMovieCount}
            eyebrow="SAVED FOR YOU"
            onMore={() => onNavigate("Library")}
            title="Favorite movies"
          >
            {renderFavoriteCards(favoriteMovies)}
          </HomeShelf>
        ) : null;
      case "favoriteSeries":
        return favoriteSeries.length > 0 ? (
          <HomeShelf
            actionLabel="Manage all"
            count={favoriteSeriesCount}
            eyebrow="SAVED FOR YOU"
            onMore={() => onNavigate("Library")}
            title="Favorite series"
          >
            {renderFavoriteCards(favoriteSeries)}
          </HomeShelf>
        ) : null;
      case "favoriteChannels":
        return favoriteChannels.length > 0 ? (
          <HomeShelf
            actionLabel="Manage all"
            count={favoriteChannelCount}
            eyebrow="SAVED FOR YOU"
            onMore={() => onNavigate("Library")}
            title="Favorite TV channels"
          >
            {renderFavoriteCards(favoriteChannels)}
          </HomeShelf>
        ) : null;
      case "watchlist":
        return watchlist.length > 0 ? (
          <HomeShelf
            actionLabel="Manage all"
            count={library.filter((item) => item.status === "WATCHLIST").length}
            eyebrow="SAVED FOR LATER"
            onMore={() => onNavigate("Library")}
            title="Your watchlist"
          >
            {watchlist.map((item) => (
              <HomeTitleCard
                actionLabel={libraryActionLabel(item, "details")}
                detail={item.parentTitle || homeContentTypeLabel(item.contentType)}
                disabled={libraryActionLabel(item, "details") === "Unavailable"}
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
        actionLabel="Explore content"
        description="Start watching or save a favorite to bring your channels, movies, and series together here."
        eyebrow="YOUR MEDIA / HOME"
        onAction={() => onNavigate(
          movies.length > 0 ? "Movies" : series.length > 0 ? "Series" : channels.length > 0 ? "Live TV" : "Movies",
        )}
        title="Make Home yours"
      />
    );
  }

  return (
    <section className="media-home">
      <header className="page-intro home-page-intro">
        <p className="eyebrow">YOUR MEDIA / HOME</p>
        <h1>Home</h1>
        <p>Your favorites and watch progress, all in one place.</p>
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
              {featuredResume.durationMillis > 0 ? ` · ${Math.round(featuredResumeProgress)}% watched` : ""}
            </small>
            {featuredResume.durationMillis > 0 && (
              <span className="library-progress"><span style={{ width: `${featuredResumeProgress}%` }} /></span>
            )}
          </div>
          <button className="primary-button" onClick={() => playLibraryItem(featuredResume)} type="button">
            <Icon name="play_arrow" />
            Resume
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
          {homeEditorOpen ? "Done editing" : "Edit Home"}
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
            <h2 id="home-layout-editor-title">Customize Home</h2>
            <p>Choose which sections to show and set their order. Changes are saved on this device.</p>
          </div>
          <button className="text-button" onClick={resetHomeLayout} type="button">Reset to default</button>
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
                <span>{HOME_SHELF_LABELS[key]}</span>
              </label>
              <div>
                <button
                  aria-label={`Move ${HOME_SHELF_LABELS[key]} up`}
                  className="icon-button home-layout-move-button move-up"
                  disabled={index === 0}
                  onClick={() => moveHomeShelf(key, -1)}
                  type="button"
                >
                  <Icon name="chevron_left" />
                </button>
                <button
                  aria-label={`Move ${HOME_SHELF_LABELS[key]} down`}
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
    LIVE: "Live TV",
    MOVIE: "Movie",
    SERIES: "Series",
    EPISODE: "Episode",
  };
  return labels[contentType];
}

function HomeShelf({
  title,
  eyebrow,
  onMore,
  count,
  actionLabel = "See all",
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
          <Icon name={actionLabel === "View details" ? "arrow_forward" : "play_arrow"} />
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

export default App;
