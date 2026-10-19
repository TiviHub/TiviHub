import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import webPackage from "../package.json";
import { checkForUpdate, type AvailableUpdate } from "./updates";
import { isAdultContent } from "./adultContent";
import { sortCatalogItems } from "./catalogSorting";
import { getCatalogImportLogSnapshot, recordCatalogImportSummary } from "./catalogImportLog";
import { getDiagnosticLogSnapshot } from "./diagnosticLog";
import {
  canAutoRefreshCatalog,
  catalogRefreshDueAt,
  isCatalogRefreshDue,
} from "./catalogCache";
import {
  formatCatalogChangeSummary,
  isSuspiciousCatalogDrop,
  summarizeCatalogChanges,
  validateCatalogForSource,
  type CatalogCandidate,
} from "./catalogRefresh";
import type { GlobalSearchCommand, GlobalSearchMatch, SearchSection } from "./globalSearch";
import { fetchM3u, parseM3uCatalog, parseM3uCatalogAsync } from "./providers/m3u";
import { fetchXmltv } from "./providers/xmltv";
import {
  loadXtreamCatalog,
  loadXtreamEpisodes,
  loadXtreamShortEpg,
  XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE,
} from "./providers/xtream";
import {
  deletePlaylistDocument,
  deletePlaylist,
  getCatalogSnapshot,
  getChannels,
  getEpgPrograms,
  getEpisodes,
  getFavorites,
  getLibraryItems,
  getMovies,
  getMdblistApiKey,
  getMdblistPopularCacheEntry,
  getMdblistRateLimitState,
  getOpenSubtitlesApiKey,
  getRatingsCacheEntry,
  saveMdblistApiKey,
  saveMdblistPopularCacheEntry,
  saveMdblistRateLimitState,
  saveRatingsCacheEntry,
  getPlaylistDocument,
  getPlaylists,
  getSeries,
  removeLibraryItem,
  replaceEpg,
  replaceEpgForChannels,
  saveCatalog,
  saveEpisodes,
  saveLibraryItem,
  saveOpenSubtitlesApiKey,
  savePlaylist,
  savePlaylistDocument,
  setActivePlaylist,
  toggleFavorite as toggleStoredFavorite,
} from "./storage/database";
import type {
  ContentType,
  EpgProgram,
  Episode,
  Favorite,
  LibraryItem,
  LibraryStatus,
  LiveChannel,
  Movie,
  PlayableItem,
  Playlist,
  Series,
} from "./types";
import { createRatingsService } from "./ratingsService";
import { createPopularCatalogService } from "./popularCatalogService";
import { configureMdblistRateLimiter } from "./mdblistRateLimit";
import { CatalogPage, LibraryPage, MovieDetail, SeriesDetail } from "./components/ContentPages";
import { CustomSelect, Icon, type IconName } from "./components/common";
import { DesktopWindowControls } from "./components/DesktopWindowControls";
import { GlobalSearchDialog } from "./components/GlobalSearchDialog";
import { PlaybackDialog } from "./components/PlaybackDialog";
import { PlaylistDeletionProgress } from "./components/PlaylistDeletionProgress";
import { ProgressIndicator } from "./components/ProgressIndicator";
import { PlaylistDialog, type PlaylistDraft } from "./components/PlaylistDialog";
import { SettingsPage } from "./components/SettingsPage";
import { StartupScreen } from "./components/StartupScreen";
import { StreamHealthCheckDialog } from "./components/StreamHealthCheckDialog";

type Section = SearchSection;
type ThemePreference = "system" | "light" | "dark";
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

const sections: { label: Section; icon: IconName }[] = [
  { label: "Home", icon: "home" },
  { label: "Live TV", icon: "live_tv" },
  { label: "Movies", icon: "movie" },
  { label: "Series", icon: "tv" },
  { label: "Library", icon: "bookmark" },
  { label: "Settings", icon: "settings" },
];

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

function visibleButton(selector: string): HTMLButtonElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>(selector)]
    .find((button) => button.getClientRects().length > 0) ?? null;
}

function App() {
  const isDesktopApp = isTauri();
  const [section, setSection] = useState<Section>("Home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showAdultContent, setShowAdultContent] = useState(readShowAdultContent);
  const [sources, setSources] = useState<Playlist[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [guideLoadCount, setGuideLoadCount] = useState(0);
  const [subtitleApiKey, setSubtitleApiKey] = useState("");
  const [mdblistApiKey, setMdblistApiKey] = useState("");
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
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSource, setDeletingSource] = useState<{
    name: string;
    completed: number;
    total: number;
    phase: "preparing" | "deleting" | "updating";
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [introVisible, setIntroVisible] = useState(
    () => isDesktopApp && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "current" | "available" | "error">("idle");
  const requestedEpgChannels = useRef(new Set<string>());
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const updateCheckController = useRef<AbortController | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalSearchReturnFocusRef = useRef<HTMLElement | null>(null);
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
  const blockingDialogOpen = sourceDialogOpen ||
    Boolean(playableItem && !(inlineLivePlayback && playableItem.live)) ||
    Boolean(streamHealthRequest);

  useEffect(() => {
    if (!introVisible) return;
    const timer = window.setTimeout(() => setIntroVisible(false), 1450);
    return () => window.clearTimeout(timer);
  }, [introVisible]);

  useEffect(() => {
    if (!ready || introVisible) startupOverlayRef.current?.focus();
  }, [introVisible, ready]);

  const checkUpdates = useCallback(async () => {
    updateCheckController.current?.abort();
    const controller = new AbortController();
    updateCheckController.current = controller;
    setUpdateStatus("checking");
    try {
      const update = await checkForUpdate(webPackage.version, controller.signal);
      if (controller.signal.aborted) return;
      setAvailableUpdate(update);
      setUpdateStatus(update ? "available" : "current");
    } catch (cause) {
      if (controller.signal.aborted) return;
      console.error("Could not check GitHub for TiviHub updates", cause);
      setUpdateStatus("error");
    }
  }, []);

  async function openAvailableUpdate() {
    if (!availableUpdate) return;
    try {
      await openUrl(availableUpdate.installerUrl);
    } catch (cause) {
      console.error("Could not open the TiviHub installer download", cause);
      setUpdateStatus("error");
    }
  }

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

  function clearNotifications() {
    if (notificationTimer.current !== null) {
      clearTimeout(notificationTimer.current);
      notificationTimer.current = null;
    }
    setError(null);
    setNotice(null);
  }

  function notify(message: string, kind: "error" | "notice") {
    if (notificationTimer.current !== null) clearTimeout(notificationTimer.current);
    setNotificationKey((key) => key + 1);
    setError(kind === "error" ? message : null);
    setNotice(kind === "notice" ? message : null);
    notificationTimer.current = setTimeout(() => {
      setError(null);
      setNotice(null);
      notificationTimer.current = null;
    }, 3000);
  }

  useEffect(() => () => {
    if (notificationTimer.current !== null) clearTimeout(notificationTimer.current);
  }, []);

  useEffect(() => {
    if (!isDesktopApp) return;
    if (import.meta.env.DEV) {
      try {
        if (window.localStorage.getItem("tivihub.debug.simulate-update") === "true") {
          setAvailableUpdate({
            version: `${webPackage.version}-simulated`,
            installerUrl: "https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe",
          });
          setUpdateStatus("available");
          return;
        }
      } catch (cause) {
        console.error("Could not read the TiviHub update simulation setting", cause);
      }
    }
    void checkUpdates();
    const timer = window.setInterval(() => void checkUpdates(), 6 * 60 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      updateCheckController.current?.abort();
    };
  }, [checkUpdates, isDesktopApp]);

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
    if (!globalSearchOpen) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [globalSearchOpen]);

  useEffect(() => {
    if (globalSearchOpen) return;
    const returnFocus = globalSearchReturnFocusRef.current;
    globalSearchReturnFocusRef.current = null;
    if (returnFocus?.isConnected) returnFocus.focus();
  }, [globalSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "k" || event.repeat) return;
      if (!ready || globalSearchOpen || sourceDialogOpen || refreshing || playableItem) return;
      event.preventDefault();
      globalSearchReturnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : visibleButton(".sidebar-search-button, .global-search-button");
      setGlobalSearchOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [globalSearchOpen, playableItem, ready, refreshing, sourceDialogOpen]);

  async function reloadLocalData(preferredSourceId?: string) {
    const savedSources = await getPlaylists();
    const chosen = savedSources.find((source) => source.id === preferredSourceId) ??
      savedSources.find((source) => source.active) ??
      savedSources[0] ??
      null;
    if (chosen && !chosen.active) await setActivePlaylist(chosen.id);
    const activeSources = chosen
      ? savedSources.map((source) => ({ ...source, active: source.id === chosen.id }))
      : savedSources;
    const [savedFavorites, savedLibrary, allEpg, key, savedMdblistKey] = await Promise.all([
      getFavorites(),
      getLibraryItems(),
      getEpgPrograms(),
      getOpenSubtitlesApiKey(),
      getMdblistApiKey(),
    ]);
    setSources(activeSources);
    setActiveSourceId(chosen?.id ?? null);
    setFavorites(savedFavorites);
    setLibrary(savedLibrary);
    setEpg(chosen ? allEpg.filter((program) => program.source === chosen.id) : []);
    setSubtitleApiKey(key);
    setMdblistApiKey(savedMdblistKey);
    if (chosen) {
      const [savedChannels, savedMovies, savedSeries] = await Promise.all([
        getChannels(chosen.id),
        getMovies(chosen.id),
        getSeries(chosen.id),
      ]);
      setChannels(savedChannels);
      setMovies(savedMovies);
      setSeries(savedSeries);
    } else {
      setChannels([]);
      setMovies([]);
      setSeries([]);
    }
  }

  useEffect(() => {
    let active = true;
    void reloadLocalData().then(() => {
      if (active) setReady(true);
    }).catch((cause: unknown) => {
      if (active) {
        notify(cause instanceof Error ? cause.message : "Could not open local TiviHub data.", "error");
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []);

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

  async function loadGuide(source: Playlist): Promise<number | null> {
    if (!source.epgUrl && source.type === "XTREAM") return null;
    if (!source.epgUrl) {
      throw new Error("Add an XMLTV guide URL in the source settings before refreshing the guide.");
    }
    const programs = await fetchXmltv(source.epgUrl, source.id);
    await replaceEpg(source.id, programs);
    setEpg(programs);
    return programs.length;
  }

  function tvGuideFailureMessage(source: Playlist) {
    return !source.epgUrl && source.type !== "XTREAM"
      ? "Add a TV guide link in source settings to see listings."
      : "The TV guide couldn't be loaded. Please try again later.";
  }

  async function loadGuideForChannels(
    requestedChannels: LiveChannel[],
    forceRefresh = false,
  ): Promise<void> {
    const source = activeSource;
    if (!source || source.type !== "XTREAM" || source.epgUrl) return;

    const now = Date.now();
    const cachedEpgByChannel = new Map<string, EpgProgram[]>();
    for (const program of epg) {
      if (program.endMillis <= now) continue;
      const programs = cachedEpgByChannel.get(program.channelId) ?? [];
      programs.push(program);
      cachedEpgByChannel.set(program.channelId, programs);
    }
    const pending = requestedChannels.filter((channel) => {
      if (!channel.providerId) return false;
      const key = `${source.id}:${channel.id}`;
      const epgChannelId = channel.tvgId || channel.id;
      if (forceRefresh) return true;
      if (requestedEpgChannels.current.has(key)) return false;
      const hasFreshShortGuide = cachedEpgByChannel.get(epgChannelId)?.some((program) =>
        program.id.startsWith(`${source.id}:${channel.id}:`),
      ) ?? false;
      if (hasFreshShortGuide) {
        requestedEpgChannels.current.add(key);
        return false;
      }
      return true;
    });
    if (pending.length === 0) return;

    for (const channel of pending) requestedEpgChannels.current.add(`${source.id}:${channel.id}`);
    setGuideLoadCount((count) => count + 1);
    notify(`Loading the TV guide for ${pending.length} channels…`, "notice");
    try {
      let requestedCount = 0;
      let failedCount = 0;
      let programCount = 0;
      for (let start = 0; start < pending.length; start += XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE) {
        const batch = pending.slice(start, start + XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE);
        const result = await loadXtreamShortEpg(source, batch);
        const channelIds = batch.map((channel) => channel.tvgId || channel.id);
        await replaceEpgForChannels(source.id, channelIds, result.programs);
        if (activeSourceId === source.id) {
          const replaced = new Set(channelIds);
          setEpg((current) => [
            ...current.filter((program) => program.source !== source.id || !replaced.has(program.channelId)),
            ...result.programs,
          ]);
        }
        requestedCount += result.requestedChannels;
        failedCount += result.failedChannels;
        programCount += result.programs.length;
      }
      const loadedCount = requestedCount - failedCount;
      notify(failedCount === 0
        ? `TV guide loaded for ${loadedCount} channels (${programCount} programmes).`
        : loadedCount === 0
          ? `No TV guide information is available for these ${requestedCount} channels right now. Try again later or check with your TV provider.`
          : `TV guide information loaded for ${loadedCount} of ${requestedCount} channels. Some listings may be missing; try again later or check with your TV provider.`,
      "notice");
    } catch {
      for (const channel of pending) requestedEpgChannels.current.delete(`${source.id}:${channel.id}`);
      notify("The TV guide couldn't be loaded. Please try again later.", "error");
    } finally {
      setGuideLoadCount((count) => Math.max(0, count - 1));
    }
  }

  async function connectSource(draft: PlaylistDraft) {
    clearNotifications();
    const playlist = draft.playlist;
    const importStartedAt = performance.now();
    let catalog: CatalogCandidate;
    let importedEpisodes: Episode[] | undefined;
    if (playlist.type === "M3U") {
      const content = draft.fileContent ??
        (playlist.fileName
          ? (await getPlaylistDocument(playlist.id))?.content
          : await fetchM3u(playlist.url, draft.signal));
      if (!content) throw new Error("The local M3U file could not be read.");
      draft.onStage?.("parsing");
      const importedCatalog = await parseM3uCatalogAsync(content, {
        id: playlist.id,
        name: playlist.name,
        url: playlist.url || undefined,
        drmLicenseUrl: playlist.drmLicenseUrl,
        drmSystem: playlist.drmSystem,
      }, draft.signal);
      catalog = {
        channels: importedCatalog.channels,
        movies: importedCatalog.movies,
        series: importedCatalog.series,
        episodes: importedCatalog.episodes,
      };
      importedEpisodes = importedCatalog.episodes;
    } else {
      const result = await loadXtreamCatalog(playlist, draft.signal);
      playlist.expiresAtMillis = result.expiresAtMillis;
      catalog = result;
    }

    if (draft.signal?.aborted) {
      throw draft.signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }
    validateCatalogForSource(playlist.id, catalog);
    const isNewSource = !sources.some((source) => source.id === playlist.id);
    const previousCatalog = isNewSource
      ? { channels: [], movies: [], series: [], episodes: [] }
      : await getCatalogSnapshot(playlist.id);
    const changeSummary = summarizeCatalogChanges(previousCatalog, catalog);
    if (!isNewSource && isSuspiciousCatalogDrop(previousCatalog, catalog) &&
      !window.confirm(
        `This source update would replace a large part of your saved catalog (${formatCatalogChangeSummary(changeSummary)}). ` +
        "The provider may be temporarily returning incomplete data. Apply this update anyway?",
      )) {
      throw new Error("Source update cancelled. Your saved catalog was kept.");
    }
    draft.onStage?.("saving");
    const shouldActivate = isNewSource || activeSourceId === playlist.id || activeSourceId === null;
    playlist.active = shouldActivate;
    const refreshAt = Date.now();
    const refreshedPlaylist: Playlist = {
      ...playlist,
      lastCatalogRefreshAt: refreshAt,
      lastCatalogRefreshAttemptAt: refreshAt,
      lastCatalogRefreshOutcome: "success",
      lastCatalogRefreshSummary: changeSummary,
    };
    await savePlaylist(playlist);
    if (draft.fileContent !== undefined) {
      await savePlaylistDocument({ playlistId: playlist.id, content: draft.fileContent });
    } else if (!playlist.fileName) {
      await deletePlaylistDocument(playlist.id);
    }
    if (shouldActivate) await setActivePlaylist(playlist.id);
    await saveCatalog({
      playlistId: playlist.id,
      ...catalog,
      episodes: importedEpisodes,
      sourceUpdate: refreshedPlaylist,
      onProgress: draft.onProgress,
    });
    await reloadLocalData(shouldActivate ? playlist.id : activeSourceId ?? undefined);
    recordCatalogImportSummary({
      provider: playlist.type,
      elapsedMillis: Math.round(performance.now() - importStartedAt),
      channels: catalog.channels.length,
      movies: catalog.movies.length,
      series: catalog.series.length,
      episodes: importedEpisodes?.length ?? null,
    });
    const catalogSummary = [
      `${catalog.channels.length.toLocaleString()} live channels`,
      `${catalog.movies.length.toLocaleString()} movies`,
      `${catalog.series.length.toLocaleString()} series`,
    ].join(", ");
    if (shouldActivate) {
      if (isNewSource) setSection("Live TV");
      try {
        const count = await loadGuide(playlist);
        const guideSummary = count === null
          ? "TV guide listings load as you browse channels."
          : `TV guide updated with ${count.toLocaleString()} programmes.`;
        notify(
          `Source ${isNewSource ? "connected" : "updated"}. ${catalogSummary}. ${guideSummary}`,
          "notice",
        );
      } catch {
        notify(
          `Source ${isNewSource ? "connected" : "updated"}. ${catalogSummary}. ${tvGuideFailureMessage(playlist)}`,
          "error",
        );
      }
    } else {
      notify(
        `Source “${playlist.name}” updated: ${catalogSummary}. Your active source was not changed.`,
        "notice",
      );
    }
  }

  function openAddSource() {
    setEditingSource(undefined);
    setSourceDialogOpen(true);
  }

  function openGlobalSearch() {
    if (!ready || refreshing || sourceDialogOpen || playableItem) return;
    globalSearchReturnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : visibleButton(".sidebar-search-button, .global-search-button");
    setGlobalSearchOpen(true);
  }

  function closeGlobalSearch(restoreFocus = true) {
    if (!restoreFocus) globalSearchReturnFocusRef.current = null;
    setGlobalSearchOpen(false);
  }

  function runGlobalSearchCommand(command: GlobalSearchCommand) {
    closeGlobalSearch(false);
    if (command.kind === "navigate") {
      setSelectedMovie(null);
      setSelectedSeries(null);
      setEpisodes([]);
      setEpisodeError(null);
      setSection(command.section);
    } else if (command.kind === "add-source") {
      openAddSource();
    } else {
      void refreshCurrentSource();
    }
  }

  function openGlobalSearchResult(result: GlobalSearchMatch) {
    closeGlobalSearch(false);
    if (result.type === "LIVE") {
      const channel = result.item;
      setSelectedMovie(null);
      setSelectedSeries(null);
      setEpisodes([]);
      setSection("Live TV");
      openPlayback({
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
    } else if (result.type === "MOVIE") {
      setSelectedMovie(result.item);
      setSelectedSeries(null);
      setSection("Movies");
    } else {
      void openSeries(result.item);
    }
  }

  async function loadDemoLibrary() {
    if (import.meta.env.DEV) {
      const { createDemoPlaylist, DEMO_PLAYLIST_CONTENT, DEMO_PLAYLIST_ID } = await import("./demo");
      clearNotifications();
      const existing = sources.find((source) => source.id === DEMO_PLAYLIST_ID);
      const shouldActivate = !existing || activeSourceId === null;
      const playlist = createDemoPlaylist(shouldActivate);
      if (existing) playlist.createdAt = existing.createdAt;
      const catalog = parseM3uCatalog(DEMO_PLAYLIST_CONTENT, {
        id: playlist.id,
        name: playlist.name,
      });
      await savePlaylist(playlist);
      await savePlaylistDocument({ playlistId: playlist.id, content: DEMO_PLAYLIST_CONTENT });
      if (shouldActivate) await setActivePlaylist(playlist.id);
      await saveCatalog({
        playlistId: playlist.id,
        channels: catalog.channels,
        movies: catalog.movies,
        series: catalog.series,
        episodes: catalog.episodes,
      });
      await reloadLocalData(shouldActivate ? playlist.id : activeSourceId ?? undefined);
      if (shouldActivate) setSection("Live TV");
      notify("Development demo added locally. Its sample streams load only when played.", "notice");
      return;
    }
    throw new Error("Demo imports are only available during development.");
  }

  async function refreshSource(source: Playlist, options: { background?: boolean } = {}) {
    const background = options.background ?? false;
    if (catalogRefreshInFlight.current.has(source.id)) {
      if (!background) notify("A catalog refresh is already in progress.", "notice");
      return;
    }
    catalogRefreshInFlight.current.add(source.id);
    let catalogCommitted = false;
    let attemptRecorded = false;
    if (!background) {
      const activeElement = document.activeElement;
      refreshReturnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : visibleButton(".settings-source-refresh");
      setRefreshing(true);
      clearNotifications();
    }
    try {
      let catalog: CatalogCandidate;
      let importedEpisodes: Episode[] | undefined;
      let expiresAtMillis = source.expiresAtMillis;
      if (source.demo) {
        if (import.meta.env.DEV) {
          const { DEMO_PLAYLIST_CONTENT } = await import("./demo");
          const importedCatalog = parseM3uCatalog(DEMO_PLAYLIST_CONTENT, {
            id: source.id,
            name: source.name,
          });
          catalog = {
            channels: importedCatalog.channels,
            movies: importedCatalog.movies,
            series: importedCatalog.series,
            episodes: importedCatalog.episodes,
          };
          importedEpisodes = importedCatalog.episodes;
          await savePlaylistDocument({ playlistId: source.id, content: DEMO_PLAYLIST_CONTENT });
        } else {
          notify("This development-only demo source is unavailable in production.", "error");
          return;
        }
      } else if (source.type === "M3U") {
        const document = source.fileName ? await getPlaylistDocument(source.id) : undefined;
        const content = document?.content ?? (source.fileName ? undefined : await fetchM3u(source.url));
        if (content === undefined) throw new Error("The imported M3U file is missing from local app storage.");
        const importedCatalog = await parseM3uCatalogAsync(content, {
          id: source.id,
          name: source.name,
          url: source.url || undefined,
          drmLicenseUrl: source.drmLicenseUrl,
          drmSystem: source.drmSystem,
        });
        catalog = {
          channels: importedCatalog.channels,
          movies: importedCatalog.movies,
          series: importedCatalog.series,
          episodes: importedCatalog.episodes,
        };
        importedEpisodes = importedCatalog.episodes;
      } else {
        const result = await loadXtreamCatalog(source);
        expiresAtMillis = result.expiresAtMillis;
        catalog = result;
      }

      validateCatalogForSource(source.id, catalog);
      const savedSources = await getPlaylists();
      const currentSource = savedSources.find((entry) => entry.id === source.id);
      if (!currentSource) {
        throw new Error("This source was removed while refreshing. Your saved catalog was not changed.");
      }
      if (
        currentSource.type !== source.type ||
        currentSource.name !== source.name ||
        currentSource.url !== source.url ||
        currentSource.username !== source.username ||
        currentSource.password !== source.password ||
        currentSource.drmLicenseUrl !== source.drmLicenseUrl ||
        currentSource.drmSystem !== source.drmSystem ||
        currentSource.epgUrl !== source.epgUrl ||
        currentSource.fileName !== source.fileName
      ) {
        throw new Error("This source changed while refreshing. Your saved catalog was not changed; please retry.");
      }

      const previousCatalog = await getCatalogSnapshot(source.id);
      const changeSummary = summarizeCatalogChanges(previousCatalog, catalog);
      const suspicious = isSuspiciousCatalogDrop(previousCatalog, catalog);
      if (suspicious) {
        const outcome = background ? "review-required" : "kept-previous";
        const applyUpdate = !background && window.confirm(
          `This refresh would replace a large part of your saved catalog (${formatCatalogChangeSummary(changeSummary)}). ` +
          "The provider may be temporarily returning incomplete data. Apply the new catalog anyway?",
        );
        if (!applyUpdate) {
          const attemptedAt = Date.now();
          await savePlaylist({
            ...currentSource,
            lastCatalogRefreshAttemptAt: attemptedAt,
            lastCatalogRefreshOutcome: outcome,
            lastCatalogRefreshSummary: changeSummary,
          });
          attemptRecorded = true;
          await reloadLocalData(background ? undefined : source.id);
          notify(background
            ? `Your saved catalog was kept. An update would make a large change (${formatCatalogChangeSummary(changeSummary)}). Use Refresh to review it.`
            : `Your saved catalog was kept. ${formatCatalogChangeSummary(changeSummary)} You can retry with Refresh.`,
          "notice");
          return;
        }
      }

      const refreshedAt = Date.now();
      const updatedSource: Playlist = {
        ...currentSource,
        expiresAtMillis,
        active: activeSourceIdRef.current === source.id,
        lastCatalogRefreshAt: refreshedAt,
        lastCatalogRefreshAttemptAt: refreshedAt,
        lastCatalogRefreshOutcome: "success",
        lastCatalogRefreshSummary: changeSummary,
      };
      await saveCatalog({
        playlistId: source.id,
        ...catalog,
        episodes: importedEpisodes,
        sourceUpdate: updatedSource,
      });
      catalogCommitted = true;
      await reloadLocalData(background ? undefined : source.id);
      if (background || source.demo) {
        if (!background) notify("Demo playlist restored from its bundled M3U fixture.", "notice");
        return;
      }
      const summaryText = formatCatalogChangeSummary(changeSummary);
      try {
        const count = await loadGuide(source);
        notify(count === null
          ? `Catalog updated. ${summaryText} Open the TV guide to load recent programmes for the channels on each page.`
          : `Catalog updated. ${summaryText} TV guide: ${count.toLocaleString()} programmes.`,
        "notice");
      } catch {
        notify(`Catalog updated. ${summaryText} ${tvGuideFailureMessage(source)}`, "error");
      }
    } catch (cause) {
      if (catalogCommitted || attemptRecorded) {
        throw new Error("The refresh outcome was saved, but the app could not reload the updated local view.", { cause });
      }
      try {
        const savedSources = await getPlaylists();
        const currentSource = savedSources.find((entry) => entry.id === source.id);
        if (
          currentSource &&
          currentSource.type === source.type &&
          currentSource.url === source.url &&
          currentSource.username === source.username &&
          currentSource.password === source.password
        ) {
          await savePlaylist({
            ...currentSource,
            lastCatalogRefreshAttemptAt: Date.now(),
            lastCatalogRefreshOutcome: "failed",
            lastCatalogRefreshSummary: undefined,
          });
          await reloadLocalData(background ? undefined : source.id);
        }
      } catch (statusError) {
        console.error("Could not save the failed catalog refresh status", statusError);
        throw new AggregateError(
          [cause, statusError],
          "The catalog refresh failed, and its status could not be saved locally.",
        );
      }
      throw cause;
    } finally {
      catalogRefreshInFlight.current.delete(source.id);
      if (!background) setRefreshing(false);
    }
  }

  const refreshSourceRef = useRef(refreshSource);
  refreshSourceRef.current = refreshSource;
  useEffect(() => {
    if (!ready || !activeSource || !canAutoRefreshCatalog(activeSource)) return;
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (delayMillis: number) => {
      timer = window.setTimeout(checkRefresh, Math.max(0, delayMillis));
    };
    const checkRefresh = () => {
      if (cancelled) return;
      if (!isCatalogRefreshDue(activeSource)) {
        schedule(catalogRefreshDueAt(activeSource) - Date.now());
        return;
      }
      if (catalogRefreshInFlight.current.has(activeSource.id)) {
        schedule(60 * 60 * 1000);
        return;
      }
      void refreshSourceRef.current(activeSource, { background: true }).catch((cause: unknown) => {
        if (cancelled) return;
        console.error("Automatic catalog refresh failed; cached catalog remains available", cause);
        const detail = cause instanceof Error ? ` ${cause.message}` : "";
        notify(`Automatic refresh failed. Your cached catalog is still available.${detail}`, "error");
        schedule(60 * 60 * 1000);
      });
    };

    checkRefresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeSource, ready]);

  async function activateSource(sourceId: string) {
    clearNotifications();
    try {
      await setActivePlaylist(sourceId);
      await reloadLocalData(sourceId);
      setSelectedSeries(null);
      setEpisodes([]);
      setSection("Home");
      const source = sources.find((entry) => entry.id === sourceId);
      if (source) notify(`Using “${source.name}”. Catalogs refresh automatically every 24 hours.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not switch sources.", "error");
    }
  }

  async function removeSource(source: Playlist) {
    if (!window.confirm(`Delete “${source.name}” and all catalog, favorite, guide, and library data linked to it from this app?`)) return;
    setDeletingSource({ name: source.name, completed: 0, total: 0, phase: "preparing" });
    try {
      await deletePlaylist(source.id, (completed, total) => {
        setDeletingSource((current) => current
          ? { ...current, completed, total, phase: "deleting" }
          : current);
      });
      setDeletingSource((current) => current ? { ...current, phase: "updating" } : current);
      const remaining = await getPlaylists();
      if (source.id === activeSourceId && remaining[0]) {
        await setActivePlaylist(remaining[0].id);
      }
      const preferredSourceId = source.id === activeSourceId ? remaining[0]?.id : activeSourceId ?? undefined;
      await reloadLocalData(preferredSourceId);
      setSelectedSeries(null);
      setEpisodes([]);
      notify(`“${source.name}” and its local data were deleted.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not delete this source.", "error");
    } finally {
      setDeletingSource(null);
    }
  }

  async function refreshCurrentSource() {
    if (!activeSource) return;
    try {
      await refreshSource(activeSource);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not refresh this source.", "error");
    }
  }

  async function refreshGuide() {
    if (!activeSource) return;
    try {
      if (activeSource.type === "XTREAM" && !activeSource.epgUrl) {
        const previouslyRequested = channels.filter((channel) =>
          requestedEpgChannels.current.has(`${activeSource.id}:${channel.id}`),
        );
        const targets = (previouslyRequested.length > 0 ? previouslyRequested : channels.slice(0, 24))
          .slice(0, 96);
        if (targets.length === 0) {
          notify("No live channels are available to load guide data for.", "notice");
          return;
        }
        await loadGuideForChannels(targets, true);
        return;
      }
      const count = await loadGuide(activeSource);
      notify(`TV guide updated with ${(count ?? 0).toLocaleString()} programmes.`, "notice");
    } catch {
      notify(tvGuideFailureMessage(activeSource), "error");
    }
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

  async function toggleFavorite(
    item: LiveChannel | Movie | Series,
    contentType: "LIVE" | "MOVIE" | "SERIES",
  ) {
    const favorite: Favorite = {
      id: `${item.playlistId}:${contentType}:${item.id}`,
      contentId: item.id,
      contentType,
      title: item.name,
      playlistId: item.playlistId,
      streamUrl: "streamUrl" in item ? item.streamUrl : undefined,
      artworkUrl: "group" in item ? item.logoUrl : item.posterUrl,
      drmLicenseUrl: "drmLicenseUrl" in item ? item.drmLicenseUrl : undefined,
      drmSystem: "drmSystem" in item ? item.drmSystem : undefined,
      addedAt: Date.now(),
    };
    try {
      const added = await toggleStoredFavorite(favorite);
      setFavorites(await getFavorites());
      notify(
        added ? `Added ${item.name} to favorites.` : `Removed ${item.name} from favorites.`,
        "notice",
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update favorites.", "error");
    }
  }

  async function addToWatchlist(item: Movie | Series, contentType: "MOVIE" | "SERIES") {
    const id = `${item.playlistId}:${contentType}:${item.id}`;
    if (library.some((entry) => entry.id === id)) return;
    try {
      await saveLibraryItem({
        id,
        contentId: item.id,
        contentType,
        playlistId: item.playlistId,
        title: item.name,
        streamUrl: "streamUrl" in item ? item.streamUrl : undefined,
        artworkUrl: item.posterUrl,
        status: "WATCHLIST",
        positionMillis: 0,
        durationMillis: 0,
        updatedAt: Date.now(),
      });
      setLibrary(await getLibraryItems());
      notify(`Added ${item.name} to your watchlist.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not add this title to your library.", "error");
    }
  }

  async function saveProgress(
    item: PlayableItem,
    positionMillis: number,
    durationMillis: number,
    watched = false,
  ) {
    const id = `${item.playlistId}:${item.contentType}:${item.id}`;
    await saveLibraryItem({
      id,
      contentId: item.id,
      contentType: item.contentType,
      playlistId: item.playlistId,
      title: item.title,
      streamUrl: item.streamUrl,
      artworkUrl: item.artworkUrl,
      drmLicenseUrl: item.drmLicenseUrl,
      drmSystem: item.drmSystem,
      status: watched ? "WATCHED" : "WATCHING",
      positionMillis: watched && durationMillis > 0 ? durationMillis : positionMillis,
      durationMillis,
      parentId: item.parentId,
      parentTitle: item.parentTitle,
      updatedAt: Date.now(),
    });
    setLibrary(await getLibraryItems());
  }

  async function changeLibraryStatus(item: LibraryItem, status: LibraryStatus) {
    try {
      await saveLibraryItem({
        ...item,
        status,
        positionMillis: status === "WATCHED" ? item.durationMillis : item.positionMillis,
        updatedAt: Date.now(),
      });
      setLibrary(await getLibraryItems());
      notify(`${item.title} marked as ${status.toLowerCase()}.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update library status.", "error");
    }
  }

  async function deleteLibraryItem(id: string, title: string) {
    try {
      await removeLibraryItem(id);
      setLibrary(await getLibraryItems());
      notify(`Removed ${title} from your library.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not remove this library item.", "error");
    }
  }

  async function removeFromLibrary(item: Movie | Series, contentType: "MOVIE" | "SERIES") {
    await deleteLibraryItem(`${item.playlistId}:${contentType}:${item.id}`, item.name);
  }

  async function removeFavorite(favorite: Favorite) {
    try {
      await toggleStoredFavorite(favorite);
      setFavorites(await getFavorites());
      notify(`Removed ${favorite.title} from favorites.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not remove this favorite.", "error");
    }
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

  function openPlayback(item: PlayableItem, position = 0) {
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
    .filter((item) => item.status === "WATCHING" && item.playlistId === activeSourceId)
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
      inert={introVisible || !ready}
    >
      <aside
        className="sidebar"
        aria-label="Primary navigation"
        inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}
      >
        <div className="sidebar-header">
          <button aria-label="TiviHub home" className="brand" onClick={() => navigateToSection("Home")} type="button">
            <img src={`${ASSET_BASE_URL}icons/tivihub-192.png`} alt="" />
            <span>TiviHub<span className="brand-period">.</span></span>
          </button>
        </div>
        <nav className="desktop-nav" id="desktop-navigation">
          <button
            aria-keyshortcuts="Control+K Meta+K"
            aria-label="Search your library"
            className="nav-item sidebar-search-button"
            disabled={!ready || refreshing || sourceDialogOpen || Boolean(playableItem)}
            onClick={openGlobalSearch}
            title="Search your library (Ctrl+K / ⌘K)"
            type="button"
          >
            <Icon name="search" />
            <span>Search</span>
          </button>
          {sections.slice(0, -1).map((item) => (
            <NavItem key={item.label} icon={item.icon} label={item.label} active={section === item.label} onClick={() => navigateToSection(item.label)} />
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            aria-current={section === "Settings" ? "page" : undefined}
            aria-label="Open settings"
            className={`nav-item sidebar-settings-button${section === "Settings" ? " active" : ""}`}
            onClick={() => navigateToSection("Settings")}
            title="Settings"
            type="button"
          >
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <div className="sidebar-footer-controls">
            <button
              aria-controls="desktop-navigation"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="sidebar-collapse sidebar-collapse-footer"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              type="button"
            >
              <Icon name={sidebarCollapsed ? "chevron_right" : "chevron_left"} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content" inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}>
        <header className="topbar">
          <button className="mobile-brand" onClick={() => navigateToSection("Home")} type="button">
            <img src={`${ASSET_BASE_URL}icons/tivihub-192.png`} alt="" />
            <span>TiviHub<span className="brand-period">.</span></span>
          </button>
          <div aria-hidden="true" className="titlebar-drag-region" data-tauri-drag-region />
          {sources.length > 0 && (
            <div className="source-switcher topbar-mobile-only">
              <Icon name="playlist_play" />
              <CustomSelect
                ariaLabel="Active source"
                className="source-switcher-dropdown"
                disabled={refreshing || sourceDialogOpen || globalSearchOpen}
                onValueChange={(sourceId) => { if (sourceId) void activateSource(sourceId); }}
                options={[
                  ...(!activeSource ? [{ disabled: true, label: "Choose a source", value: "" }] : []),
                  ...sources.map((source) => ({ label: source.name, value: source.id })),
                ]}
                title={activeSource?.name ?? "Choose a source"}
                value={activeSource?.id ?? ""}
                variant="embedded"
              />
            </div>
          )}
          <div className="topbar-actions topbar-mobile-only">
            <button
              aria-keyshortcuts="Control+K Meta+K"
              aria-label="Search your library"
              className="icon-button global-search-button"
              disabled={!ready || refreshing || sourceDialogOpen || Boolean(playableItem)}
              onClick={openGlobalSearch}
              title="Search your library (Ctrl+K / ⌘K)"
              type="button"
            >
              <Icon name="search" />
            </button>
            <button
              aria-label="Open settings"
              aria-current={section === "Settings" ? "page" : undefined}
              className={`icon-button settings-shortcut${section === "Settings" ? " selected" : ""}`}
              onClick={() => navigateToSection("Settings")}
              type="button"
            >
              <Icon name="settings" />
            </button>
          </div>
          <DesktopWindowControls />
        </header>

        {ready && (
          <>
            {(section === "Live TV" || (inlineLivePlayback && playableItem?.live)) && (
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
            {section === "Live TV" ? null : section === "Home" ? (
              <Home
                channels={visibleChannels}
                favorites={visibleFavorites}
                epg={visibleEpg}
                library={visibleLibrary}
                movies={visibleMovies}
                onLoadGuideForChannels={(requestedChannels) => void loadGuideForChannels(requestedChannels)}
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
            ) : section === "Movies" && selectedMovie && (showAdultContent || !isAdultContent(selectedMovie.name, selectedMovie.category)) ? (
              <MovieDetail
                favorite={visibleFavorites.some((favorite) => favorite.contentId === selectedMovie.id)}
                inLibrary={visibleLibrary.some((entry) => entry.contentId === selectedMovie.id && entry.contentType === "MOVIE")}
                continueWatching={Boolean(movieProgress)}
                movie={selectedMovie}
                playlistMovies={visibleMovies}
                ratingsService={ratingsService}
                onOpenMovie={(item) => setSelectedMovie(item)}
                onAddToLibrary={() => void addToWatchlist(selectedMovie, "MOVIE")}
                onBack={() => navigateAppHistory(-1)}
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
                guideLoading={guideLoadCount > 0}
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
                  onBack={() => navigateAppHistory(-1)}
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
                  guideLoading={guideLoadCount > 0}
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
                onChangeStatus={(item, status) => void changeLibraryStatus(item, status)}
                onPlay={(item, position) => openPlayback(item, position)}
                onRemove={(id, title) => void deleteLibraryItem(id, title)}
                onRemoveFavorite={(favorite) => void removeFavorite(favorite)}
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

      <nav
        className="mobile-nav"
        aria-label="Primary navigation"
        inert={refreshing || globalSearchOpen || blockingDialogOpen || Boolean(deletingSource)}
      >
        {sections.filter((item) => item.label !== "Settings").map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label} active={section === item.label} onClick={() => navigateToSection(item.label)} compact />
        ))}
      </nav>

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
      {globalSearchOpen && !refreshing && !sourceDialogOpen && !playableItem && (
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
    {(!ready || introVisible) && (
      <StartupScreen
        animate={introVisible}
        logoSrc={`${ASSET_BASE_URL}icons/tivihub.svg`}
        screenRef={startupOverlayRef}
      />
    )}
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  compact = false,
}: {
  icon: IconName;
  label: Section;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`nav-item${active ? " active" : ""}${compact ? " compact" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>{label === "Live TV" && compact ? "Live" : label}</span>
    </button>
  );
}

function HomeEmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: IconName;
  onAction: () => void;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="home-empty-title" className="home-empty">
      <div className="home-empty-panel">
        <div className="home-empty-prompt">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="home-empty-title">{title}</h1>
          <p className="home-empty-description">{description}</p>
          <button className="primary-button home-empty-action" onClick={onAction} type="button">
            <Icon name={actionIcon} />
            {actionLabel}
            <Icon name="arrow_forward" />
          </button>
          {children}
        </div>
        <div aria-hidden="true" className="home-empty-art">
          <div className="home-empty-orbit home-empty-orbit-outer" />
          <div className="home-empty-orbit home-empty-orbit-inner" />
          <div className="home-empty-logo-core">
            <img alt="" src={`${ASSET_BASE_URL}icons/tivihub-512.png`} />
          </div>
          <span className="home-empty-star home-empty-star-one">✦</span>
          <span className="home-empty-star home-empty-star-two">✧</span>
          <span className="home-empty-caption">TIVIHUB / DESKTOP</span>
          <div className="home-empty-art-card home-empty-art-card-top">
            <Icon name="movie" /><span>YOUR LIBRARY</span>
          </div>
          <div className="home-empty-art-card home-empty-art-card-bottom">
            <span className="home-empty-art-pulse" /><span>READY WHEN YOU ARE</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Home({
  channels,
  favorites,
  epg,
  library,
  movies,
  series,
  source,
  sourceCount,
  continueWatching,
  onAddSource,
  onOpenMovie,
  onOpenSeries,
  onLoadGuideForChannels,
  onNavigate,
  onPlay,
}: {
  channels: LiveChannel[];
  favorites: Favorite[];
  epg: EpgProgram[];
  library: LibraryItem[];
  movies: Movie[];
  series: Series[];
  source: Playlist | null;
  sourceCount: number;
  continueWatching: LibraryItem[];
  onAddSource: () => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onNavigate: (section: Section) => void;
  onPlay: (item: PlayableItem, position: number) => void;
}) {
  if (source) {
    return (
      <MediaHome
        channels={channels}
        continueWatching={continueWatching}
        epg={epg}
        favorites={favorites}
        library={library}
        movies={movies}
        onNavigate={onNavigate}
        onLoadGuideForChannels={onLoadGuideForChannels}
        onOpenMovie={onOpenMovie}
        onOpenSeries={onOpenSeries}
        onPlay={onPlay}
        series={series}
        sourceId={source.id}
        sourceName={source.name}
      />
    );
  }

  if (sourceCount === 0) {
    return (
      <HomeEmptyState
        actionIcon="add"
        actionLabel="Add source"
        description="Connect an M3U playlist or Xtream Codes account to build your library. Your source details are stored on this device; playback requests go directly to your provider."
        eyebrow="YOUR PRIVATE MEDIA SPACE"
        onAction={onAddSource}
        title="Add your first source"
      >
        <div aria-label="Supported source types" className="home-empty-source-types">
          <span><Icon name="playlist_play" /> M3U playlist</span>
          <span><Icon name="dns" /> Xtream Codes</span>
        </div>
      </HomeEmptyState>
    );
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
  sourceId,
  sourceName,
  channels,
  epg,
  movies,
  series,
  continueWatching,
  library,
  favorites,
  onNavigate,
  onLoadGuideForChannels,
  onOpenMovie,
  onOpenSeries,
  onPlay,
}: {
  sourceId: string;
  sourceName: string;
  channels: LiveChannel[];
  epg: EpgProgram[];
  movies: Movie[];
  series: Series[];
  continueWatching: LibraryItem[];
  library: LibraryItem[];
  favorites: Favorite[];
  onNavigate: (section: Section) => void;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onPlay: (item: PlayableItem, position: number) => void;
}) {
  const homeChannels = channels.slice(0, 12);
  const latestMovies = useMemo(() => sortCatalogItems(movies, "added").slice(0, 10), [movies]);
  const latestSeries = useMemo(() => sortCatalogItems(series, "added").slice(0, 10), [series]);
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
    item.status === "WATCHING" && item.playlistId === sourceId,
  ).length;
  const globalFavorites = useMemo(() => [...favorites]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 12), [favorites]);
  const homeChannelKey = `${sourceId}:${homeChannels.map((channel) => channel.id).join("|")}`;
  const onLoadGuideRef = useRef(onLoadGuideForChannels);
  onLoadGuideRef.current = onLoadGuideForChannels;
  useEffect(() => {
    if (homeChannels.length > 0) onLoadGuideRef.current(homeChannels);
  }, [homeChannelKey]);
  const currentPrograms = useMemo(() => {
    const now = Date.now();
    const byChannel = new Map<string, EpgProgram>();
    for (const program of epg) {
      if (program.startMillis > now || program.endMillis <= now) continue;
      const existing = byChannel.get(program.channelId);
      if (!existing || program.startMillis < existing.startMillis) {
        byChannel.set(program.channelId, program);
      }
    }
    return byChannel;
  }, [epg]);

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

  if (library.length === 0 && favorites.length === 0 &&
    (movies.length > 0 || series.length > 0 || channels.length > 0)) {
    const destination: Section = movies.length > 0 ? "Movies" : series.length > 0 ? "Series" : "Live TV";
    return (
      <HomeEmptyState
        actionIcon="play_arrow"
        actionLabel="Start watching"
        description="Start watching a movie, series, or live channel and it will appear here."
        eyebrow="YOUR LIBRARY"
        onAction={() => onNavigate(destination)}
        title="Your library is empty"
      />
    );
  }

  const featuredContinue = library
    .filter((item) => item.status === "WATCHING")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find((item) => item.streamUrl) ?? continueWatching.find((item) => item.streamUrl) ?? continueWatching[0];
  const featuredFavorite = globalFavorites[0];
  const featuredMovie = latestMovies[0];
  const featuredSeries = latestSeries[0];
  const featuredChannel = homeChannels[0];
  let featured: {
    eyebrow: string;
    title: string;
    detail: string;
    image?: string;
    wide?: boolean;
    progress?: number;
    actionLabel: string;
    onAction: () => void;
  };
  if (featuredContinue) {
    featured = {
      eyebrow: "CONTINUE WATCHING",
      title: featuredContinue.title,
      detail: featuredContinue.parentTitle || homeContentTypeLabel(featuredContinue.contentType),
      image: featuredContinue.artworkUrl,
      wide: featuredContinue.contentType === "LIVE",
      progress: featuredContinue.durationMillis > 0
        ? Math.max(0, Math.min(100, featuredContinue.positionMillis / featuredContinue.durationMillis * 100))
        : undefined,
      actionLabel: "Continue watching",
      onAction: () => openLibraryItem(featuredContinue, "resume"),
    };
  } else if (featuredFavorite) {
    featured = {
      eyebrow: "FROM YOUR FAVORITES",
      title: featuredFavorite.title,
      detail: homeContentTypeLabel(featuredFavorite.contentType),
      image: featuredFavorite.artworkUrl,
      wide: featuredFavorite.contentType === "LIVE",
      actionLabel: featuredFavorite.contentType === "LIVE" ? "Watch live" : "Open title",
      onAction: () => openFavorite(featuredFavorite),
    };
  } else if (featuredMovie) {
    featured = {
      eyebrow: "PICKED FOR YOUR LIBRARY",
      title: featuredMovie.name,
      detail: [featuredMovie.year, featuredMovie.category].filter(Boolean).join(" · ") || "Movie",
      image: featuredMovie.posterUrl,
      actionLabel: "Explore movie",
      onAction: () => onOpenMovie(featuredMovie),
    };
  } else if (featuredSeries) {
    featured = {
      eyebrow: "PICKED FOR YOUR LIBRARY",
      title: featuredSeries.name,
      detail: `${featuredSeries.seasons} seasons`,
      image: featuredSeries.posterUrl,
      actionLabel: "Explore series",
      onAction: () => onOpenSeries(featuredSeries),
    };
  } else if (featuredChannel) {
    featured = {
      eyebrow: "ON AIR NOW",
      title: featuredChannel.name,
      detail: currentPrograms.get(featuredChannel.tvgId || featuredChannel.id)?.title || featuredChannel.group,
      image: featuredChannel.logoUrl,
      wide: true,
      actionLabel: "Watch live",
      onAction: () => onPlay({
        id: featuredChannel.id,
        playlistId: featuredChannel.playlistId,
        contentType: "LIVE",
        title: featuredChannel.name,
        streamUrl: featuredChannel.streamUrl,
        artworkUrl: featuredChannel.logoUrl,
        drmLicenseUrl: featuredChannel.drmLicenseUrl,
        drmSystem: featuredChannel.drmSystem,
        live: true,
      }, 0),
    };
  } else {
    featured = {
      eyebrow: "YOUR LIBRARY",
      title: sourceName,
      detail: "Refresh your source or add another one to bring your media here.",
      actionLabel: "Manage sources",
      onAction: () => onNavigate("Settings"),
    };
  }

  return (
    <section className="media-home">
      <section className="personal-home-hero">
        {featured.image && (
          <img
            alt=""
            className="personal-home-backdrop"
            onError={(event) => { event.currentTarget.hidden = true; }}
            src={featured.image}
          />
        )}
        <div aria-hidden="true" className="personal-home-backdrop-overlay" />
        <div className={`personal-home-poster${featured.wide ? " is-wide" : ""}`}>
          <Icon name={featured.wide ? "live_tv" : "movie"} />
          {featured.image && (
            <img alt="" onError={(event) => { event.currentTarget.hidden = true; }} src={featured.image} />
          )}
        </div>
        <div className="personal-home-copy">
          <p className="eyebrow">{featured.eyebrow}</p>
          <h1>{featured.title}</h1>
          <p className="personal-home-detail">{featured.detail} · {sourceName}</p>
          {featured.progress !== undefined && (
            <div aria-label={`${Math.round(featured.progress)}% watched`} className="personal-home-progress">
              <span style={{ width: `${featured.progress}%` }} />
            </div>
          )}
          <button className="primary-button" onClick={featured.onAction} type="button">
            <Icon name={featured.eyebrow === "CONTINUE WATCHING" || featured.eyebrow === "ON AIR NOW" ? "play_arrow" : "arrow_forward"} />
            {featured.actionLabel}
          </button>
        </div>
      </section>

      {continueWatching.length > 0 && (
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
      )}

      {watchedChannels.length > 0 && (
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
      )}

      {recentlyWatched.length > 0 && (
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
      )}

      {globalFavorites.length > 0 && (
        <HomeShelf
          actionLabel="Manage all"
          count={favorites.length}
          eyebrow="SAVED FOR YOU"
          onMore={() => onNavigate("Library")}
          title="Global favorites"
        >
          {globalFavorites.map((favorite) => (
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
          ))}
        </HomeShelf>
      )}

      {watchlist.length > 0 && (
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
      )}

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
      disabled={disabled}
      onClick={onClick}
      title={`${actionLabel} ${title}`}
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
          <strong title={title}>{title}</strong>
          <small title={detail}>{detail}</small>
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
