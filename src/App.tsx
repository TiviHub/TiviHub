import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import webPackage from "../package.json";
import { fetchM3u, parseM3uCatalog } from "./providers/m3u";
import { fetchXmltv } from "./providers/xmltv";
import { loadXtreamCatalog, loadXtreamEpisodes, loadXtreamShortEpg } from "./providers/xtream";
import {
  deletePlaylistDocument,
  deletePlaylist,
  getChannels,
  getEpgPrograms,
  getEpisodes,
  getFavorites,
  getLibraryItems,
  getMovies,
  getOpenSubtitlesApiKey,
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
import { CatalogPage, LibraryPage, MovieDetail, SeriesDetail } from "./components/ContentPages";
import { Icon, type IconName } from "./components/common";
import { PlaybackDialog } from "./components/PlaybackDialog";
import { PlaylistDialog, type PlaylistDraft } from "./components/PlaylistDialog";
import { SettingsPage } from "./components/SettingsPage";

type Section = "Home" | "Live TV" | "Movies" | "Series" | "Library" | "Settings";
type ThemePreference = "system" | "light" | "dark";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

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

function App() {
  const [section, setSection] = useState<Section>("Home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
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
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [playableItem, setPlayableItem] = useState<PlayableItem | null>(null);
  const [resumePosition, setResumePosition] = useState(0);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Playlist | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const requestedEpgChannels = useRef(new Set<string>());
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const refreshOverlayRef = useRef<HTMLDivElement>(null);
  const refreshReturnFocusRef = useRef<HTMLElement | null>(null);

  const activeSource = sources.find((source) => source.id === activeSourceId) ?? null;

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
    if (refreshing) {
      refreshOverlayRef.current?.focus();
      return;
    }
    const returnFocus = refreshReturnFocusRef.current;
    if (!returnFocus) return;
    refreshReturnFocusRef.current = null;
    if (returnFocus.isConnected) returnFocus.focus();
    else refreshButtonRef.current?.focus();
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
    const [savedFavorites, savedLibrary, allEpg, key] = await Promise.all([
      getFavorites(),
      getLibraryItems(),
      getEpgPrograms(),
      getOpenSubtitlesApiKey(),
    ]);
    setSources(activeSources);
    setActiveSourceId(chosen?.id ?? null);
    setFavorites(savedFavorites);
    setLibrary(savedLibrary);
    setEpg(chosen ? allEpg.filter((program) => program.source === chosen.id) : []);
    setSubtitleApiKey(key);
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

  useEffect(() => {
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handleInstallAvailable);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallAvailable);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    try {
      window.localStorage.setItem("tivihub.web.theme", value);
    } catch (cause) {
      console.error("Could not save the local theme preference", cause);
      notify("Could not save the theme preference in this browser.", "error");
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
    notify(`Loading short TV guide data for ${pending.length} channels…`, "notice");
    try {
      const result = await loadXtreamShortEpg(source, pending);
      const channelIds = pending.map((channel) => channel.tvgId || channel.id);
      await replaceEpgForChannels(source.id, channelIds, result.programs);
      if (activeSourceId === source.id) {
        const replaced = new Set(channelIds);
        setEpg((current) => [
          ...current.filter((program) => program.source !== source.id || !replaced.has(program.channelId)),
          ...result.programs,
        ]);
      }
      const loadedChannels = result.requestedChannels - result.failedChannels;
      notify(result.failedChannels === 0
        ? `TV guide loaded for ${loadedChannels} channels (${result.programs.length} programmes).`
        : `TV guide loaded for ${loadedChannels} of ${result.requestedChannels} channels. ${result.failureMessage || `${result.failedChannels} channels did not return guide data.`}`,
      "notice");
    } catch (cause) {
      for (const channel of pending) requestedEpgChannels.current.delete(`${source.id}:${channel.id}`);
      notify(cause instanceof Error
        ? `Could not load the TV guide: ${cause.message}`
        : "Could not load the TV guide from this provider.",
      "error");
    } finally {
      setGuideLoadCount((count) => Math.max(0, count - 1));
    }
  }

  async function connectSource(draft: PlaylistDraft) {
    clearNotifications();
    const playlist = draft.playlist;
    let catalog: { channels: LiveChannel[]; movies: Movie[]; series: Series[] };
    let importedEpisodes: Episode[] = [];
    if (playlist.type === "M3U") {
      const content = draft.fileContent ??
        (playlist.fileName
          ? (await getPlaylistDocument(playlist.id))?.content
          : await fetchM3u(playlist.url));
      if (!content) throw new Error("The local M3U file could not be read.");
      const importedCatalog = parseM3uCatalog(content, {
        id: playlist.id,
        name: playlist.name,
        url: playlist.url || undefined,
        drmLicenseUrl: playlist.drmLicenseUrl,
        drmSystem: playlist.drmSystem,
      });
      catalog = {
        channels: importedCatalog.channels,
        movies: importedCatalog.movies,
        series: importedCatalog.series,
      };
      importedEpisodes = importedCatalog.episodes;
    } else {
      const result = await loadXtreamCatalog(playlist);
      playlist.expiresAtMillis = result.expiresAtMillis;
      catalog = result;
    }

    const isNewSource = !sources.some((source) => source.id === playlist.id);
    const shouldActivate = isNewSource || activeSourceId === playlist.id || activeSourceId === null;
    playlist.active = shouldActivate;
    await savePlaylist(playlist);
    if (draft.fileContent !== undefined) {
      await savePlaylistDocument({ playlistId: playlist.id, content: draft.fileContent });
    } else if (!playlist.fileName) {
      await deletePlaylistDocument(playlist.id);
    }
    if (shouldActivate) await setActivePlaylist(playlist.id);
    await saveCatalog({ playlistId: playlist.id, ...catalog });
    if (importedEpisodes.length > 0) {
      await Promise.all(catalog.series.map((item) =>
        saveEpisodes(playlist.id, item.id, importedEpisodes.filter((episode) => episode.seriesId === item.id)),
      ));
    }
    await reloadLocalData(shouldActivate ? playlist.id : activeSourceId ?? undefined);
    if (shouldActivate) {
      if (isNewSource) setSection("Live TV");
      try {
        const count = await loadGuide(playlist);
        notify(count === null
          ? `Source ${isNewSource ? "connected" : "updated"}. Open the TV guide to load recent programmes for the channels on each page.`
          : `Source ${isNewSource ? "connected" : "updated"}. Loaded ${count.toLocaleString()} TV guide programmes.`,
        "notice");
      } catch (cause) {
        notify(cause instanceof Error
          ? `Source ${isNewSource ? "connected" : "updated"}. TV guide not loaded: ${cause.message}`
          : `Source ${isNewSource ? "connected" : "updated"}. Add an XMLTV guide URL to load programme information.`,
        "error");
      }
    } else {
      notify(`Source “${playlist.name}” updated. Your active source was not changed.`, "notice");
    }
  }

  function openAddSource() {
    setEditingSource(undefined);
    setSourceDialogOpen(true);
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
      });
      await Promise.all(catalog.series.map((item) =>
        saveEpisodes(playlist.id, item.id, catalog.episodes.filter((episode) => episode.seriesId === item.id)),
      ));
      await reloadLocalData(shouldActivate ? playlist.id : activeSourceId ?? undefined);
      if (shouldActivate) setSection("Live TV");
      notify("Demo playlist added to this browser. Its sample streams load only when played.", "notice");
      return;
    }
    throw new Error("Demo imports are only available during development.");
  }

  async function refreshSource(source: Playlist) {
    const activeElement = document.activeElement;
    refreshReturnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : refreshButtonRef.current;
    setRefreshing(true);
    clearNotifications();
    try {
      let catalog: { channels: LiveChannel[]; movies: Movie[]; series: Series[] };
      let importedEpisodes: Episode[] = [];
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
        if (content === undefined) throw new Error("The imported M3U file is missing from local browser storage.");
        const importedCatalog = parseM3uCatalog(content, {
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
        };
        importedEpisodes = importedCatalog.episodes;
      } else {
        const result = await loadXtreamCatalog(source);
        source.expiresAtMillis = result.expiresAtMillis;
        catalog = result;
        await savePlaylist(source);
      }
      await saveCatalog({ playlistId: source.id, ...catalog });
      if (importedEpisodes.length > 0) {
        await Promise.all(catalog.series.map((item) =>
          saveEpisodes(source.id, item.id, importedEpisodes.filter((episode) => episode.seriesId === item.id)),
        ));
      }
      await reloadLocalData(source.id);
      if (source.demo) {
        notify("Demo playlist restored from its bundled M3U fixture.", "notice");
        return;
      }
      notify("Catalog updated from your provider.", "notice");
      try {
        const count = await loadGuide(source);
        notify(count === null
          ? "Catalog updated. Open the TV guide to load recent programmes for the channels on each page."
          : `Catalog and TV guide updated (${count.toLocaleString()} programmes).`,
        "notice");
      } catch (cause) {
        notify(cause instanceof Error
          ? `Catalog updated. TV guide not refreshed: ${cause.message}`
          : "Catalog updated. TV guide not refreshed.",
        "error");
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function activateSource(sourceId: string) {
    clearNotifications();
    try {
      await setActivePlaylist(sourceId);
      await reloadLocalData(sourceId);
      setSelectedSeries(null);
      setEpisodes([]);
      setSection("Home");
      const source = sources.find((entry) => entry.id === sourceId);
      if (source) notify(`Using “${source.name}”. Refresh when you want to check for catalog updates.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not switch sources.", "error");
    }
  }

  async function removeSource(source: Playlist) {
    if (!window.confirm(`Delete “${source.name}” and all catalog, favorite, guide, and library data linked to it from this browser?`)) return;
    try {
      await deletePlaylist(source.id);
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
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not refresh the TV guide.", "error");
    }
  }

  async function saveApiKey(value: string) {
    await saveOpenSubtitlesApiKey(value);
    setSubtitleApiKey(value.trim());
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
    setSection("Series");
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
    const source = sources.find((entry) => entry.id === item.playlistId);
    setPlayableItem({
      ...item,
      drmCertificateUrl: item.drmCertificateUrl || source?.drmCertificateUrl,
    });
  }

  const continueWatching = library
    .filter((item) => item.status === "WATCHING" && item.playlistId === activeSourceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4);
  const movieProgress = selectedMovie
    ? library
      .filter((item) =>
      item.contentId === selectedMovie.id &&
      item.contentType === "MOVIE" &&
      item.status === "WATCHING",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined;
  const seriesEpisodeProgress = selectedSeries
    ? library
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
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Primary navigation" inert={refreshing}>
        <button aria-label="TiviHub home" className="brand" onClick={() => setSection("Home")} type="button">
          <img src="/icons/tivihub-192.png" alt="" />
          <span>TiviHub<span className="brand-period">.</span></span>
        </button>
        <p className="nav-caption">YOUR SPACE</p>
        <nav className="desktop-nav" id="desktop-navigation">
          {sections.map((item) => (
            <NavItem key={item.label} icon={item.icon} label={item.label} active={section === item.label} onClick={() => setSection(item.label)} />
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="online-indicator" />
          <span className="sidebar-version">TiviHub v{webPackage.version}</span>
          <button
            aria-controls="desktop-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            <Icon name={sidebarCollapsed ? "chevron_right" : "chevron_left"} />
          </button>
        </div>
      </aside>

      <main className="main-content" inert={refreshing}>
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setSection("Home")} type="button">
            <img src="/icons/tivihub-192.png" alt="" />
            <span>TiviHub<span className="brand-period">.</span></span>
          </button>
          <div className="breadcrumb">
            <span>PLAYER</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">{section.toUpperCase()}</span>
          </div>
          <div className="topbar-actions">
            {sources.length > 0 && (
              <label className="source-switcher">
                <span className="sr-only">Active playlist</span>
                <Icon name="playlist_play" />
                <select aria-label="Active playlist" onChange={(event) => void activateSource(event.target.value)} value={activeSourceId ?? ""}>
                  {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
              </label>
            )}
            {sources.length > 0 && (
              <button
                aria-label="Refresh current source"
                className="icon-button refresh-button"
                disabled={!activeSource || refreshing}
                onClick={() => void refreshCurrentSource()}
                ref={refreshButtonRef}
                type="button"
              >
                <Icon name="refresh" />
              </button>
            )}
            <button className="add-source-button" onClick={openAddSource} type="button">
              <Icon name="add" /><span>Add source</span>
            </button>
            <button
              aria-label="Open settings"
              aria-current={section === "Settings" ? "page" : undefined}
              className={`icon-button settings-shortcut${section === "Settings" ? " selected" : ""}`}
              onClick={() => setSection("Settings")}
              type="button"
            >
              <Icon name="settings" />
            </button>
            {installPrompt && (
              <button className="install-button" onClick={() => void installApp()} type="button">
                <Icon name="download" /><span>Install</span>
              </button>
            )}
          </div>
        </header>

        {!ready ? (
          <div className="startup-loading"><span className="spinner" /> Opening your local library…</div>
        ) : (
          <>
            {section === "Home" ? (
              <Home
                channels={channels}
                epg={epg}
                movies={movies}
                onLoadGuideForChannels={(requestedChannels) => void loadGuideForChannels(requestedChannels)}
                series={series}
                source={activeSource}
                sourceCount={sources.length}
                continueWatching={continueWatching}
                onAddSource={openAddSource}
                onOpenMovie={(movie) => {
                  setSelectedMovie(movie);
                  setSelectedSeries(null);
                  setSection("Movies");
                }}
                onOpenSeries={(item) => void openSeries(item)}
                onNavigate={setSection}
                onPlay={(item, position) => openPlayback(item, position)}
              />
            ) : section === "Settings" ? (
              <SettingsPage
                activeSourceId={activeSourceId}
                onAddSource={openAddSource}
                apiKey={subtitleApiKey}
                onActivate={(id) => void activateSource(id)}
                onChooseTheme={chooseTheme}
                onDataRestored={onDataRestored}
                onDelete={(source) => void removeSource(source)}
                onEdit={(source) => {
                  setEditingSource(source);
                  setSourceDialogOpen(true);
                }}
                onRefreshEpg={refreshGuide}
                onSaveApiKey={saveApiKey}
                sources={sources}
                theme={theme}
              />
            ) : section === "Movies" && selectedMovie ? (
              <MovieDetail
                favorite={favorites.some((favorite) => favorite.contentId === selectedMovie.id)}
                inLibrary={library.some((entry) => entry.contentId === selectedMovie.id && entry.contentType === "MOVIE")}
                continueWatching={Boolean(movieProgress)}
                movie={selectedMovie}
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
            ) : section === "Live TV" || section === "Movies" ? (
              <CatalogPage
                key={section}
                channels={channels}
                epg={epg}
                favorites={favorites}
                guideLoading={guideLoadCount > 0}
                library={library}
                loading={refreshing}
                movies={movies}
                onAddToLibrary={(item, type) => void addToWatchlist(item, type)}
                onLoadGuideForChannels={(visibleChannels) => void loadGuideForChannels(visibleChannels)}
                onOpenMovie={(movie) => {
                  setSelectedMovie(movie);
                  setSelectedSeries(null);
                  setSection("Movies");
                }}
                onOpenSeries={(item) => void openSeries(item)}
                onPlay={(item) => openPlayback(item)}
                onToggleFavorite={(item, type) => void toggleFavorite(item, type)}
                section={section}
                series={series}
              />
            ) : section === "Series" ? (
              selectedSeries ? (
                <SeriesDetail
                  episodes={episodes}
                  error={episodeError}
                  favorite={favorites.some((favorite) => favorite.contentId === selectedSeries.id)}
                  inLibrary={library.some((entry) => entry.contentId === selectedSeries.id && entry.contentType === "SERIES")}
                  continueWatching={Boolean(seriesEpisodeProgress)}
                  loading={episodeLoading}
                  onBack={() => setSelectedSeries(null)}
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
                />
              ) : (
                <CatalogPage
                  key="Series"
                  channels={channels}
                  epg={epg}
                  favorites={favorites}
                  guideLoading={guideLoadCount > 0}
                  library={library}
                  loading={refreshing}
                  movies={movies}
                  onAddToLibrary={(item, type) => void addToWatchlist(item, type)}
                  onLoadGuideForChannels={(visibleChannels) => void loadGuideForChannels(visibleChannels)}
                  onOpenMovie={setSelectedMovie}
                  onOpenSeries={(item) => void openSeries(item)}
                  onPlay={(item) => openPlayback(item)}
                  onToggleFavorite={(item, type) => void toggleFavorite(item, type)}
                  section="Series"
                  series={series}
                />
              )
            ) : (
              <LibraryPage
                favorites={favorites}
                library={library}
                onChangeStatus={(item, status) => void changeLibraryStatus(item, status)}
                onPlay={(item, position) => openPlayback(item, position)}
                onRemove={(id, title) => void deleteLibraryItem(id, title)}
                onRemoveFavorite={(favorite) => void removeFavorite(favorite)}
              />
            )}
          </>
        )}
      </main>

      {(error || notice) && (
        <div aria-live={error ? "assertive" : "polite"} className="notification-stack" inert={refreshing}>
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

      <nav className="mobile-nav" aria-label="Primary navigation" inert={refreshing}>
        {sections.filter((item) => item.label !== "Settings").map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label} active={section === item.label} onClick={() => setSection(item.label)} compact />
        ))}
      </nav>

      {sourceDialogOpen && (
        <div className="refresh-dialog-host" inert={refreshing}>
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
      {playableItem && (
        <PlaybackDialog
          item={playableItem}
          onClose={() => setPlayableItem(null)}
          onProgress={saveProgress}
          resumePositionMillis={resumePosition}
          subtitleApiKey={subtitleApiKey}
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
            <div aria-label="Source refresh progress" className="refresh-progress-track" role="progressbar">
              <span />
            </div>
          </section>
        </div>
      )}
    </div>
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

function Home({
  channels,
  epg,
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
  epg: EpgProgram[];
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
        movies={movies}
        onNavigate={onNavigate}
        onLoadGuideForChannels={onLoadGuideForChannels}
        onOpenMovie={onOpenMovie}
        onOpenSeries={onOpenSeries}
        onPlay={onPlay}
        series={series}
        sourceId={source.id}
      />
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
          <h1>Tune in to<br /><span className="neon-text">your universe.</span></h1>
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
          <div className="orbit-core"><img src="/icons/tivihub-512.png" alt="" /></div>
          <span className="orbit-star star-one">✦</span><span className="orbit-star star-two">✧</span>
          <span className="orbit-caption">SIGNAL / 001</span>
        </div>
      </section>

      <section className="privacy-strip" aria-label="Privacy and platform highlights">
        <Highlight icon="devices" label="Made for your screens" detail="Phone to desktop" />
        <Highlight icon="shield" label="Local-first library" detail="Saved in this browser" />
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
                className="home-continue-card"
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
        <span>TIVIHUB WEB <span className="footer-separator">/</span> BUILT FOR YOUR BROWSER</span>
        <span>Bring sources you are authorized to use.</span>
      </footer>
    </>
  );
}

function MediaHome({
  sourceId,
  channels,
  epg,
  movies,
  series,
  continueWatching,
  onNavigate,
  onLoadGuideForChannels,
  onOpenMovie,
  onOpenSeries,
  onPlay,
}: {
  sourceId: string;
  channels: LiveChannel[];
  epg: EpgProgram[];
  movies: Movie[];
  series: Series[];
  continueWatching: LibraryItem[];
  onNavigate: (section: Section) => void;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onOpenMovie: (movie: Movie) => void;
  onOpenSeries: (series: Series) => void;
  onPlay: (item: PlayableItem, position: number) => void;
}) {
  const homeChannels = channels.slice(0, 12);
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

  function playLibraryItem(item: LibraryItem) {
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
    }, item.positionMillis);
  }

  return (
    <section className="media-home">
      <HomeShelf
        emptyMessage={continueWatching.length === 0 ? "Your movies and series will appear here as you watch them." : undefined}
        eyebrow="PICK UP WHERE YOU LEFT OFF"
        onMore={() => onNavigate("Library")}
        title="Continue watching"
      >
        {continueWatching.map((item) => (
          <button className="home-title-card continue-title-card" key={item.id} onClick={() => playLibraryItem(item)} type="button">
            <span className="home-title-art">
              {item.artworkUrl ? <img alt="" loading="lazy" src={item.artworkUrl} /> : <Icon name="play_arrow" />}
              <span className="home-card-play"><Icon name="play_arrow" /></span>
              {item.durationMillis > 0 && (
                <span className="home-card-progress">
                  <span style={{ width: `${Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100))}%` }} />
                </span>
              )}
            </span>
            <strong>{item.title}</strong>
            <small>{item.parentTitle || item.contentType}</small>
          </button>
        ))}
      </HomeShelf>

      {movies.length > 0 && (
        <HomeShelf title="Movies" eyebrow="MADE FOR MOVIE NIGHT" onMore={() => onNavigate("Movies")}>
          {movies.slice(0, 12).map((movie) => (
            <HomeTitleCard
              detail={movie.year ? String(movie.year) : movie.category || "Movie"}
              icon="movie"
              image={movie.posterUrl}
              key={movie.id}
              onClick={() => onOpenMovie(movie)}
              title={movie.name}
            />
          ))}
        </HomeShelf>
      )}

      {series.length > 0 && (
        <HomeShelf title="Series" eyebrow="YOUR NEXT BINGE" onMore={() => onNavigate("Series")}>
          {series.slice(0, 12).map((item) => (
            <HomeTitleCard
              detail={`${item.seasons} seasons`}
              icon="tv"
              image={item.posterUrl}
              key={item.id}
              onClick={() => onOpenSeries(item)}
              title={item.name}
            />
          ))}
        </HomeShelf>
      )}

      {channels.length > 0 && (
        <HomeShelf title="Live TV" eyebrow="ON AIR RIGHT NOW" onMore={() => onNavigate("Live TV")}>
          {homeChannels.map((channel) => {
            const program = currentPrograms.get(channel.tvgId || channel.id);
            const progress = program
              ? Math.max(0, Math.min(100, (Date.now() - program.startMillis) / (program.endMillis - program.startMillis) * 100))
              : undefined;
            return (
              <HomeTitleCard
                detail={program?.title || channel.group}
                icon="live_tv"
                image={channel.logoUrl}
                key={channel.id}
                onClick={() => onPlay({
                  id: channel.id,
                  playlistId: channel.playlistId,
                  contentType: "LIVE",
                  title: channel.name,
                  streamUrl: channel.streamUrl,
                  artworkUrl: channel.logoUrl,
                  drmLicenseUrl: channel.drmLicenseUrl,
                  drmSystem: channel.drmSystem,
                  live: true,
                }, 0)}
                progress={progress}
                title={channel.name}
                wide
              />
            );
          })}
        </HomeShelf>
      )}
    </section>
  );
}

function HomeShelf({
  title,
  eyebrow,
  onMore,
  emptyMessage,
  children,
}: {
  title: string;
  eyebrow: string;
  onMore: () => void;
  emptyMessage?: string;
  children: ReactNode;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (activeDrag.moved) {
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  return (
    <section className="home-shelf">
      <div className="home-shelf-heading">
        <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
        <button className="text-button" onClick={onMore} type="button">See all <Icon name="arrow_forward" /></button>
      </div>
      {emptyMessage ? (
        <p className="home-shelf-empty">{emptyMessage}</p>
      ) : (
        <div
          className={`home-shelf-track${dragging ? " is-dragging" : ""}`}
          onClickCapture={(event) => {
            if (!suppressClick.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }}
          onPointerCancel={finishDrag}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            drag.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startScrollLeft: event.currentTarget.scrollLeft,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const activeDrag = drag.current;
            if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
            const offset = event.clientX - activeDrag.startX;
            if (!activeDrag.moved && Math.abs(offset) > 5) {
              activeDrag.moved = true;
              suppressClick.current = true;
              setDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            if (activeDrag.moved) {
              event.preventDefault();
              event.currentTarget.scrollLeft = activeDrag.startScrollLeft - offset;
            }
          }}
          onPointerUp={finishDrag}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function HomeTitleCard({
  title,
  detail,
  image,
  icon,
  onClick,
  progress,
  wide = false,
}: {
  title: string;
  detail: string;
  image?: string;
  icon: IconName;
  onClick: () => void;
  progress?: number;
  wide?: boolean;
}) {
  return (
    <button className={`home-title-card${wide ? " wide-title-card" : ""}`} onClick={onClick} title={title} type="button">
      <span className="home-title-art">
        {image ? <img alt="" draggable={false} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={image} /> : <Icon name={icon} />}
        <span className="home-card-play"><Icon name="play_arrow" /></span>
        {progress !== undefined && (
          <span className="home-card-progress">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      <strong>{title}</strong>
      <small>{detail}</small>
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
