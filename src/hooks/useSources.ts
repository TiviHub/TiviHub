import { useEffect, useRef } from "react";
import { recordCatalogImportSummary } from "../catalogImportLog";
import {
  canAutoRefreshCatalog,
  catalogRefreshDueAt,
  isCatalogRefreshDue,
  isPlaylistExpired,
} from "../catalogCache";
import {
  formatCatalogChangeSummary,
  isSuspiciousCatalogDrop,
  summarizeCatalogChanges,
  validateCatalogForSource,
  type CatalogCandidate,
} from "../catalogRefresh";
import type { SearchSection } from "../globalSearch";
import { keepM3uIds } from "../m3uIds";
import { visibleButton } from "../visibleButton";
import { fetchM3u, parseM3uCatalog, parseM3uCatalogAsync } from "../providers/m3u";
import { fetchXmltv } from "../providers/xmltv";
import {
  loadXtreamCatalog,
  loadXtreamShortEpg,
  XtreamAccountExpiredError,
  XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE,
} from "../providers/xtream";
import {
  deletePlaylistDocument,
  deletePlaylist,
  getCatalogSnapshot,
  getPlaylistDocument,
  getPlaylists,
  replaceEpg,
  replaceEpgForChannels,
  saveCatalog,
  savePlaylist,
  savePlaylistDocument,
  setActivePlaylist,
} from "../storage/database";
import type {
  EpgProgram,
  Episode,
  LiveChannel,
  Playlist,
  Series,
} from "../types";
import { type PlaylistDraft } from "../components/PlaylistDialog";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface SourceDeps {
  notify: (message: string, kind: "error" | "notice") => void;
  clearNotifications: () => void;
  activeSource: Playlist | null;
  activeSourceId: string | null;
  activeSourceIdRef: MutableRefObject<string | null>;
  sources: Playlist[];
  channels: LiveChannel[];
  epg: EpgProgram[];
  ready: boolean;
  reloadLocalData: (preferredSourceId?: string) => Promise<void>;
  expiredSourceIds: Set<string>;
  setExpiredSourceIds: Setter<Set<string>>;
  requestedEpgChannels: MutableRefObject<Set<string>>;
  catalogRefreshInFlight: MutableRefObject<Set<string>>;
  refreshReturnFocusRef: MutableRefObject<HTMLElement | null>;
  setDeletingSource: Setter<{
    name: string;
    completed: number;
    total: number;
    phase: "preparing" | "deleting" | "updating";
  } | null>;
  setSection: Setter<SearchSection>;
  setSelectedSeries: Setter<Series | null>;
  setRefreshing: Setter<boolean>;
  setGuideLoadCount: Setter<number>;
  setEpisodes: Setter<Episode[]>;
  setEpg: Setter<EpgProgram[]>;
}

// rtmp://, rtsp:// and udp:// entries cannot play in TiviHub, so the M3U parser leaves them out.
const skippedLabel = (count: number) =>
  count > 0 ? `${count.toLocaleString()} skipped (not HTTP or HTTPS)` : "";

export function useSources(deps: SourceDeps) {
  const {
    notify,
    clearNotifications,
    activeSource,
    activeSourceId,
    activeSourceIdRef,
    sources,
    channels,
    epg,
    ready,
    reloadLocalData,
    expiredSourceIds,
    setExpiredSourceIds,
    requestedEpgChannels,
    catalogRefreshInFlight,
    refreshReturnFocusRef,
    setDeletingSource,
    setSection,
    setSelectedSeries,
    setRefreshing,
    setGuideLoadCount,
    setEpisodes,
    setEpg,
  } = deps;

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
    let skippedStreams = 0;
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
      skippedStreams = importedCatalog.skipped;
    } else {
      try {
        const result = await loadXtreamCatalog(playlist, draft.signal);
        playlist.expiresAtMillis = result.expiresAtMillis;
        catalog = result;
      } catch (cause) {
        if (cause instanceof XtreamAccountExpiredError) {
          setExpiredSourceIds((current) => new Set(current).add(playlist.id));
        }
        throw cause;
      }
    }

    if (draft.signal?.aborted) {
      throw draft.signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }
    validateCatalogForSource(playlist.id, catalog);
    const isNewSource = !sources.some((source) => source.id === playlist.id);
    const previousCatalog = isNewSource
      ? { channels: [], movies: [], series: [], episodes: [] }
      : await getCatalogSnapshot(playlist.id);
    if (playlist.type === "M3U") keepM3uIds(catalog, previousCatalog);
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
    setExpiredSourceIds((current) => {
      if (!current.has(playlist.id)) return current;
      const next = new Set(current);
      next.delete(playlist.id);
      return next;
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
      skippedLabel(skippedStreams),
    ].filter(Boolean).join(", ");
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

  async function loadDemoLibrary() {
    if (import.meta.env.DEV) {
      const { createDemoPlaylist, DEMO_PLAYLIST_CONTENT, DEMO_PLAYLIST_ID } = await import("../demo");
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
    if (isPlaylistExpired(source)) {
      setExpiredSourceIds((current) => new Set(current).add(source.id));
      return;
    }
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
      let skippedStreams = 0;
      let expiresAtMillis = source.expiresAtMillis;
      if (source.demo) {
        if (import.meta.env.DEV) {
          const { DEMO_PLAYLIST_CONTENT } = await import("../demo");
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
        skippedStreams = importedCatalog.skipped;
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
      if (source.type === "M3U") keepM3uIds(catalog, previousCatalog);
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
      setExpiredSourceIds((current) => {
        if (!current.has(source.id)) return current;
        const next = new Set(current);
        next.delete(source.id);
        return next;
      });
      await reloadLocalData(background ? undefined : source.id);
      if (background || source.demo) {
        if (!background) notify("Demo playlist restored from its bundled M3U fixture.", "notice");
        return;
      }
      const summaryText = formatCatalogChangeSummary(changeSummary) +
        (skippedStreams > 0 ? ` ${skippedLabel(skippedStreams)}.` : "");
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
      if (cause instanceof XtreamAccountExpiredError) {
        setExpiredSourceIds((current) => new Set(current).add(source.id));
        return;
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
    if (
      !ready ||
      !activeSource ||
      !canAutoRefreshCatalog(activeSource) ||
      isPlaylistExpired(activeSource) ||
      expiredSourceIds.has(activeSource.id)
    ) return;
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
  }, [activeSource, expiredSourceIds, ready]);

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
      setExpiredSourceIds((current) => {
        if (!current.has(source.id)) return current;
        const next = new Set(current);
        next.delete(source.id);
        return next;
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


  return {
    activateSource,
    connectSource,
    loadDemoLibrary,
    loadGuideForChannels,
    refreshCurrentSource,
    refreshGuide,
    removeSource,
  };
}
