import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import webPackage from "../package.json";
import { t, useLocale } from "./lib/i18n";
import { useAppPreferences } from "./hooks/useAppPreferences";
import { useParentalPin } from "./hooks/useParentalPin";
import { MultiViewDialog } from "./components/MultiViewDialog";
import { useReminders } from "./hooks/useReminders";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useRefreshOverlay } from "./hooks/useRefreshOverlay";
import { useDownloads } from "./hooks/useDownloads";
import { useLocalData } from "./hooks/useLocalData";
import { usePlayback } from "./hooks/usePlayback";
import { useLibrary } from "./hooks/useLibrary";
import { useGlobalSearch } from "./hooks/useGlobalSearch";
import { useStalkerKeepAlive } from "./hooks/useStalkerKeepAlive";
import { useSources } from "./hooks/useSources";
import { useNotifications } from "./hooks/useNotifications";
import { isAdultContent } from "./lib/adultContent";
import { getCatalogImportLogSnapshot } from "./lib/catalogImportLog";
import { getDiagnosticLogSnapshot } from "./lib/diagnosticLog";
import {
  isPlaylistExpired,
} from "./services/catalogCache";
import type { SearchSection } from "./lib/globalSearch";
import { loadStalkerEpisodes } from "./providers/stalker";
import {
  loadXtreamEpisodes,
} from "./providers/xtream";
import {
  getEpisodes,
  getMdblistApiKey,
  getMdblistRateLimitState,
  getRatingsCacheEntry,
  saveMdblistApiKey,
  saveMdblistRateLimitState,
  saveRatingsCacheEntry,
  saveEpisodes,
  saveOpenSubtitlesApiKey,
} from "./storage/database";
import type { ContentType, Episode, Favorite, LiveChannel, Movie, PlayableItem, Playlist, Reminder, Series } from "./types";
import { createRatingsService } from "./services/ratingsService";
import { configureMdblistRateLimiter } from "./lib/mdblistRateLimit";
import { playableChannel } from "./components/ContentPages";
import { MovieDetail, SeriesDetail } from "./components/DetailPages";
import { LiveTvPage } from "./components/LiveTvPage";
import { CatalogBrowsePage } from "./components/CatalogBrowsePage";
import { useMovieBrowse } from "./hooks/useMovieBrowse";
import { useSeriesBrowse } from "./hooks/useSeriesBrowse";
import { LibraryPage } from "./components/LibraryPage";
import { Icon, TooltipLayer } from "./components/common";
import { MobileNav, Sidebar, Topbar } from "./components/AppShell";
import { RemindersMenu } from "./components/RemindersMenu";
import { DownloadsPage } from "./components/DownloadsPage";
import { LiveGuide } from "./components/LiveGuide";
import { NoSourceEmptyState } from "./components/NoSourceEmptyState";
import { GlobalSearchDialog } from "./components/GlobalSearchDialog";
import { Home } from "./components/HomePage";
import { PlaybackDialog } from "./components/PlaybackDialog";
import { PlaylistDeletionProgress } from "./components/PlaylistDeletionProgress";
import { ProgressIndicator } from "./components/ProgressIndicator";
import { PlaylistDialog } from "./components/PlaylistDialog";
import { SettingsPage } from "./components/SettingsPage";
import { Toast } from "./components/Toast";
import { StartupScreen } from "./components/StartupScreen";

type Section = SearchSection;
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
configureMdblistRateLimiter({
  get: () => getMdblistRateLimitState("account"),
  put: saveMdblistRateLimitState,
});
const ASSET_BASE_URL = import.meta.env.BASE_URL;

function App() {
  const isDesktopApp = isTauri();
  const [section, setSection] = useState<Section>("Home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [guideLoadCount, setGuideLoadCount] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Playlist | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const { refreshOverlayRef, refreshReturnFocusRef } = useRefreshOverlay(refreshing);
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
  useLocale(); // the whole tree renders again when the language changes
  const { theme, showAdultContent, chooseTheme, chooseShowAdultContent } = useAppPreferences(notify);
  const parentalPin = useParentalPin(notify);
  const [multiView, setMultiView] = useState<{ start?: LiveChannel; channels: LiveChannel[] } | null>(null);
  const reminderState = useReminders(notify);
  const { reminderIds, toggleReminder } = reminderState;
  const {
    favorites, library, setFavorites, setLibrary, toggleFavorite, addToWatchlist, saveProgress,
    changeLibraryStatus, deleteLibraryItem, removeFromLibrary, removeFavorite,
  } = useLibrary(notify);
  const {
    sources, activeSourceId, channels, movies, series, addMovies, addSeries, epg, setEpg, subtitleApiKey, setSubtitleApiKey,
    mdblistApiKey, setMdblistApiKey, ready, reloadLocalData,
  } = useLocalData({ notify, setFavorites, setLibrary });
  const {
    playableItem, inlineLivePlayback, resumePosition,
    openPlayback, openReplay, openExternal, closePlayback, recordWatchedChannel,
  } = usePlayback({ notify, setLibrary, sources });
  const {
    downloads, downloadTasks, downloadDirectoryPath, downloadsLoaded, downloadedIds, activeDownloadIds,
    startDownload, cancelDownload, removeFailedDownload, deleteDownload, clearDownloads,
    changeDownloadDirectory, playDownload,
  } = useDownloads({ notify, openPlayback, sources });
  const [expiredSourceIds, setExpiredSourceIds] = useState<Set<string>>(() => new Set());
  const [expiryCheckTime, setExpiryCheckTime] = useState(() => Date.now());
  const { availableUpdate, updateStatus, checkUpdates, openAvailableUpdate } = useAppUpdate(isDesktopApp);
  const requestedEpgChannels = useRef(new Set<string>());
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const startupOverlayRef = useRef<HTMLDivElement>(null);
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
  useStalkerKeepAlive(activeSource, ready);
  const activeSourceExpired = Boolean(activeSource && (
    isPlaylistExpired(activeSource, expiryCheckTime) || expiredSourceIds.has(activeSource.id)
  ));
  const blockingDialogOpen = sourceDialogOpen || multiView !== null ||
    Boolean(playableItem && !(inlineLivePlayback && playableItem.live));
  const canOpenGlobalSearch = ready &&
    !refreshing &&
    !sourceDialogOpen &&
    multiView === null &&
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
      notify(t("app.openUrlFailed"), "error");
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
        if (!source || source.type === "M3U") {
          throw new Error(t("app.episodesUnavailable"));
        }
        savedEpisodes = source.type === "STALKER"
          ? await loadStalkerEpisodes(source, item)
          : await loadXtreamEpisodes(source, item);
        await saveEpisodes(item.playlistId, item.id, savedEpisodes);
      }
      setEpisodes(savedEpisodes);
    } catch (cause) {
      setEpisodeError(cause instanceof Error ? cause.message : t("app.episodesFailed"));
    } finally {
      setEpisodeLoading(false);
    }
  }

  // Channels are loaded for the active source only, so a reminder of another source cannot be opened.
  function reminderChannel(reminder: Reminder) {
    return channels.find((item) => item.id === reminder.channelId && item.playlistId === reminder.playlistId);
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

  const openMovie = (movie: Movie) => {
    setSelectedMovie(movie);
    setSelectedSeries(null);
    navigateToSection("Movies");
  };
  const catalogProps = {
    channels: visibleChannels,
    epg: visibleEpg,
    favorites: visibleFavorites,
    library: visibleLibrary,
    loading: refreshing,
    movies: visibleMovies,
    onAddToLibrary: (item: Movie | Series, type: "MOVIE" | "SERIES") => void addToWatchlist(item, type),
    onLoadGuideForChannels: (guideChannels: LiveChannel[]) => void loadGuideForChannels(guideChannels),
    onOpenMovie: openMovie,
    onOpenSeries: (item: Series) => void openSeries(item),
    onPlay: (item: PlayableItem) => openPlayback(item),
    onToggleFavorite: (item: LiveChannel | Movie | Series, type: "LIVE" | "MOVIE" | "SERIES") =>
      void toggleFavorite(item, type),
    series: visibleSeries,
  };

  function openFavorite(favorite: Favorite) {
    if (favorite.contentType === "MOVIE") {
      const movie = visibleMovies.find((item) =>
        item.id === favorite.contentId && item.playlistId === favorite.playlistId,
      );
      if (movie) {
        navigateToSection("Movies");
        setSelectedMovie(movie);
        setSelectedSeries(null);
      } else {
        notify(t("app.movieMissing"), "error");
      }
    } else if (favorite.contentType === "SERIES") {
      const show = visibleSeries.find((item) =>
        item.id === favorite.contentId && item.playlistId === favorite.playlistId,
      );
      if (show) void openSeries(show);
      else notify(t("app.seriesMissing"), "error");
    }
  }

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

      <main className={`main-content${((section === "Live TV" || section === "TV Guide" || (section === "Movies" && !selectedMovie) || (section === "Series" && !selectedSeries)) && activeSource) || section === "Settings" || ((section === "Library" || section === "Downloads") && sources.length > 0) ? " main-content--browse" : ""}`} inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}>
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
          remindersMenu={(
            <RemindersMenu
              canOpen={(reminder) => Boolean(reminderChannel(reminder))}
              onOpen={(reminder) => {
                const channel = reminderChannel(reminder);
                if (!channel) return;
                navigateToSection("Live TV");
                openPlayback(playableChannel(channel));
              }}
              onClearRecent={reminderState.clearRecent}
              onMarkSeen={reminderState.markSeen}
              onRemove={(id) => void reminderState.removeReminder(id)}
              recent={reminderState.recent}
              reminders={reminderState.reminders}
              unseen={reminderState.unseen}
            />
          )}
          section={section}
        />
        {activeSourceExpired && (
          <button
            className="topbar-expiry-warning topbar-expiry-floating"
            onClick={openExpiredPlaylist}
            type="button"
          >
            <Icon name="error_outline" />
            <span>{t("topbar.expiredLabel")}</span>
          </button>
        )}

        {ready && (
          <>
            {activeSource && (section === "Live TV" || (inlineLivePlayback && playableItem?.live)) && (
              <div
                key={activeSourceId ?? "no-active-source"}
                className={`live-tv-persistent${section === "Live TV" ? "" : " is-mini"}`}
              >
                <LiveTvPage
                  onOpenMultiView={(start, channels) => { closePlayback(); setMultiView({ start, channels }); }}
                  epg={visibleEpg}
                  favorites={visibleFavorites}
                  guideLoading={guideLoadCount > 0}
                  onLoadGuideForChannels={catalogProps.onLoadGuideForChannels}
                  onPlay={catalogProps.onPlay}
                  onReplay={openReplay}
                  onToggleReminder={toggleReminder}
                  reminderIds={reminderIds}
                  onToggleFavorite={catalogProps.onToggleFavorite}
                  showAdultContent={showAdultContent}
                  source={activeSource}
                  storedChannels={channels}
                  livePlaybackItemId={inlineLivePlayback && playableItem?.live ? playableItem.id : undefined}
                  livePlayer={inlineLivePlayback && playableItem?.live ? (
                    <PlaybackDialog
                      inline
                      item={playableItem}
                      key={playableItem.id}
                      mini={section !== "Live TV"}
                      onClose={closePlayback}
                      onExpand={() => navigateToSection("Live TV")}
                      onOpenExternal={openExternal}
                      onProgress={saveProgress}
                      onStarted={(item) => void recordWatchedChannel(item)}
                      resumePositionMillis={resumePosition}
                      subtitleApiKey={subtitleApiKey}
                    />
                  ) : undefined}
                  livePlayerMini={section !== "Live TV"}
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
                onOpenMovie={openMovie}
                onOpenSeries={(item) => void openSeries(item)}
                onNavigate={navigateToSection}
                onPlay={(item, position) => {
                  // A channel plays on the Live TV page, not in the floating player.
                  if (item.live) navigateToSection("Live TV");
                  openPlayback(item, position);
                }}
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
                onReplay={openReplay}
                onToggleReminder={toggleReminder}
                reminderIds={reminderIds}
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
                parentalPin={parentalPin}
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
              <CatalogBrowsePage
                // One page per section: the chosen category, search and sort of Movies mean nothing in Series.
                key={section}
                favorites={visibleFavorites}
                library={visibleLibrary}
                onAddToLibrary={(item) => void addToWatchlist(item, "MOVIE")}
                onOpen={openMovie}
                onToggleFavorite={(item) => void toggleFavorite(item, "MOVIE")}
                section="Movies"
                source={activeSource ?? undefined}
                storedItems={movies}
                showAdultContent={showAdultContent}
                useItems={useMovieBrowse}
                onFetched={addMovies}
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
                <CatalogBrowsePage
                // One page per section: the chosen category, search and sort of Movies mean nothing in Series.
                key={section}
                  favorites={visibleFavorites}
                  library={visibleLibrary}
                  onAddToLibrary={(item) => void addToWatchlist(item, "SERIES")}
                  onOpen={(item) => void openSeries(item)}
                  onToggleFavorite={(item) => void toggleFavorite(item, "SERIES")}
                  section="Series"
                  source={activeSource ?? undefined}
                  storedItems={series}
                  showAdultContent={showAdultContent}
                  useItems={useSeriesBrowse}
                  onFetched={addSeries}
                />
              )
            ) : (
              <LibraryPage
                favorites={visibleFavorites}
                library={visibleLibrary}
                sourceCount={sources.length}
                onAddSource={openAddSource}
                onChangeStatus={(item, status) => void changeLibraryStatus(item, status)}
                onPlay={(item, position) => {
                  // A channel plays on the Live TV page, not in the floating player.
                  if (item.live) navigateToSection("Live TV");
                  openPlayback(item, position);
                }}
                onRemove={(id, title) => void deleteLibraryItem(id, title)}
                onRemoveFavorite={(favorite) => void removeFavorite(favorite)}
                onOpenFavorite={openFavorite}
              />
            )}
          </>
        )}
      </main>

      {(error || notice) && (
        <div aria-live={error ? "assertive" : "polite"} className="notification-stack" inert={refreshing || globalSearchOpen || Boolean(deletingSource)}>
          <Toast key={notificationKey} kind={error ? "error" : "notice"} onDismiss={clearNotifications}>{error ?? notice}</Toast>
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
          onOpenExternal={openExternal}
                      onProgress={saveProgress}
          resumePositionMillis={resumePosition}
          subtitleApiKey={subtitleApiKey}
        />
      )}
      {multiView && activeSource && (
        <MultiViewDialog
          channels={multiView.channels}
          onClose={() => setMultiView(null)}
          source={activeSource}
          start={multiView.start}
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
            <p className="eyebrow">{t("app.refreshEyebrow")}</p>
            <h2 id="refresh-progress-title">{t("app.refreshTitle")}</h2>
            <p id="refresh-progress-description">
              {t("app.refreshDescription")}
            </p>
            <ProgressIndicator label={t("app.refreshProgress")} />
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

export default App;
