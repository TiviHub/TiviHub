import { soundIsMissing } from "../lib/playbackAudio";
import { proxiedUrl, proxyBase, usesNativeTransport } from "../providers/transport";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import webPackage from "../../package.json";
import type { PlayableItem } from "../types";
import type { SubtitleResult } from "../providers/opensubtitles";
import { subtitleService } from "../services/subtitleService";
import { playbackErrorMessage } from "../lib/playbackErrors";
import {
  browserSummary,
  createPlaybackDiagnosticReport,
  inspectPlaybackCapabilities,
  playbackDiagnosticError,
  shouldAttemptNativeHlsFallback,
  type BackendDiagnosticEvent,
  type PlaybackDiagnosticFailure,
  type PlaybackPath,
} from "../lib/playbackDiagnostics";
import { CustomSelect, Icon } from "./common";
import { Skeleton } from "./Skeleton";
import { CastPanel } from "./CastPanel";
import { SubtitlePanel } from "./SubtitlePanel";
import { PlayerMenu } from "./PlayerMenu";
import { PlayerControls } from "./PlayerControls";
import { ProgressIndicator } from "./ProgressIndicator";
import { MAX_SUBTITLE_BYTES, NATIVE_TRACK_EVENTS, asWebVtt, directMediaUrl, mediaDuration, nativeHlsUrl, type CastDeviceInfo, type ShakaPlayer, type ShakaRuntime, type ShakaVariantTrack, type TextTrackOption } from "../lib/playbackMedia";

export function PlaybackDialog({
  item,
  inline = false,
  mini = false,
  subtitleApiKey,
  resumePositionMillis,
  onExpand,
  onClose,
  onOpenExternal,
  onStarted,
  onProgress,
}: {
  item: PlayableItem;
  inline?: boolean;
  mini?: boolean;
  subtitleApiKey: string;
  resumePositionMillis: number;
  onExpand?: () => void;
  onClose: () => void;
  /** Hands the stream to VLC or mpv; given only where that is possible. */
  onOpenExternal?: (item: PlayableItem) => void;
  onStarted?: (item: PlayableItem) => void;
  onProgress: (
    item: PlayableItem,
    positionMillis: number,
    durationMillis: number,
    watched?: boolean,
  ) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [soundMissing, setSoundMissing] = useState(false);
  const restoreFocusFrameRef = useRef<number | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusCapturedRef = useRef(false);
  const playerRef = useRef<ShakaPlayer | null>(null);
  const onProgressRef = useRef(onProgress);
  const onCloseRef = useRef(onClose);
  const closeRef = useRef<() => Promise<void>>(async () => {});
  const onStartedRef = useRef(onStarted);
  const lastSaveRef = useRef(0);
  const subtitleUrlsRef = useRef<string[]>([]);
  const playbackFailuresRef = useRef<PlaybackDiagnosticFailure[]>([]);
  const playbackPathRef = useRef<PlaybackPath>("Unknown");
  const nativeHlsFallbackAttemptedRef = useRef(false);
  const nativeHlsFallbackInProgressRef = useRef(false);
  const playbackFailedRef = useRef(false);
  const hasStartedPlaybackRef = useRef(false);
  const [status, setStatus] = useState("Preparing playback…");
  const [error, setError] = useState<string | null>(null);
  const [diagnosticCopyMessage, setDiagnosticCopyMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TextTrackOption[]>([]);
  const [variantTracks, setVariantTracks] = useState<ShakaVariantTrack[]>([]);
  const [audioLanguages, setAudioLanguages] = useState<{ language: string; label: string }[]>([]);
  const [selectedAudioLanguage, setSelectedAudioLanguage] = useState("");
  const [qualityHeights, setQualityHeights] = useState<number[]>([]);
  const [qualityChoice, setQualityChoice] = useState("auto");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const nativeTrackIdsRef = useRef(new WeakMap<TextTrack, number>());
  const nextNativeTrackIdRef = useRef(0);
  const [subtitleQuery, setSubtitleQuery] = useState(item.title);
  const [subtitleResults, setSubtitleResults] = useState<SubtitleResult[]>([]);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [savedSubtitles, setSavedSubtitles] = useState<{ fileId: number; name: string }[]>([]);
  const attachedSubtitlesRef = useRef(new Map<number, () => void>());
  const [castOpen, setCastOpen] = useState(false);
  const [castDevices, setCastDevices] = useState<CastDeviceInfo[]>([]);
  const [castBusy, setCastBusy] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [castingDevice, setCastingDevice] = useState<CastDeviceInfo | null>(null);
  onProgressRef.current = onProgress;
  onCloseRef.current = onClose;
  onStartedRef.current = onStarted;

  function recordPlaybackFailure(path: PlaybackPath, cause: unknown) {
    const failure = { path, ...playbackDiagnosticError(cause) };
    const previous = playbackFailuresRef.current.at(-1);
    if (
      previous?.path === failure.path &&
      previous.code === failure.code &&
      previous.category === failure.category &&
      previous.httpStatus === failure.httpStatus
    ) return;
    playbackFailuresRef.current = [...playbackFailuresRef.current, failure].slice(-10);
  }

  function showPlaybackFailure(message: string, path: PlaybackPath, cause?: unknown) {
    playbackFailedRef.current = true;
    recordPlaybackFailure(path, cause);
    setError(message);
    setDiagnosticCopyMessage(null);
    setStatus("Playback failed");
  }

  async function copyDiagnostics() {
    if (!navigator.clipboard?.writeText) {
      setDiagnosticCopyMessage("Clipboard isn't available here. Try again in the app window.");
      return;
    }
    let backendErrors: BackendDiagnosticEvent[] = [];
    if (isTauri()) {
      try {
        backendErrors = await invoke<BackendDiagnosticEvent[]>("get_backend_diagnostics");
      } catch {
        setDiagnosticCopyMessage("Couldn't collect app diagnostics. Nothing was copied; please try again.");
        return;
      }
    }
    const report = createPlaybackDiagnosticReport({
      appVersion: webPackage.version,
      browser: browserSummary(navigator.userAgent),
      failures: playbackFailuresRef.current,
      drmConfigured: Boolean(item.drmLicenseUrl),
      nativeHlsFallbackAttempted: nativeHlsFallbackAttemptedRef.current,
      ...inspectPlaybackCapabilities(videoRef.current),
      backendErrors,
    });
    try {
      await navigator.clipboard.writeText(report);
      setDiagnosticCopyMessage("Error details copied. You can paste them into your support message.");
    } catch {
      setDiagnosticCopyMessage("Couldn't access the clipboard. Please try again.");
    }
  }

  useEffect(() => {
    if (inline) return;
    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = null;
    }
    if (!focusCapturedRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      focusCapturedRef.current = true;
    }
    dialogRef.current?.querySelector<HTMLButtonElement>(".playback-header-actions button:not(:disabled)")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!dialog || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutsideDialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutsideDialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
        restoreFocusFrameRef.current = null;
        const previousFocus = previousFocusRef.current;
        previousFocusRef.current = null;
        focusCapturedRef.current = false;
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, [inline]);

  function syncTracks(player: ShakaPlayer) {
    setTracks(player.getTextTracks().map((track) => ({
      id: track.id,
      label: track.label || track.language || "Subtitle",
      language: track.language,
      active: track.active,
    })));
  }

  function syncVariantTracks(player: ShakaPlayer) {
    const variants = player.getVariantTracks();
    setVariantTracks(variants);
    const languages = new Map<string, { language: string; label: string }>();
    for (const track of variants) {
      if (!track.language) continue;
      const key = track.language;
      if (!languages.has(key)) {
        languages.set(key, {
          language: key,
          label: track.label || key.toUpperCase(),
        });
      }
    }
    const availableLanguages = [...languages.values()];
    setAudioLanguages(availableLanguages);
    const activeLanguage = variants.find((track) => track.active)?.language;
    setSelectedAudioLanguage((current) =>
      availableLanguages.some((track) => track.language === current)
        ? current
        : activeLanguage ?? availableLanguages[0]?.language ?? "",
    );
    setQualityHeights([...new Set(
      variants.map((track) => track.height).filter((height): height is number => Boolean(height)),
    )].sort((left, right) => right - left));
  }

  function syncNativeTracks() {
    const video = videoRef.current;
    if (!video) return;
    setTracks(Array.from(video.textTracks)
      .filter((track) => track.kind === "captions" || track.kind === "subtitles")
      .map((track) => {
        let id = nativeTrackIdsRef.current.get(track);
        if (id === undefined) {
          id = nextNativeTrackIdRef.current;
          nextNativeTrackIdRef.current += 1;
          nativeTrackIdsRef.current.set(track, id);
        }
        return {
          id,
          label: track.label || track.language || `Subtitle ${id + 1}`,
          language: track.language,
          active: track.mode === "showing",
        };
      }));
  }

  async function persistProgress(watched = false) {
    const video = videoRef.current;
    if (!video || item.live || item.replay) return;
    try {
      await onProgressRef.current(
        item,
        Math.round(video.currentTime * 1000),
        mediaDuration(video),
        watched,
      );
      setSaveError(null);
    } catch {
      setSaveError("Couldn't save playback progress. Your video can keep playing.");
    }
  }

  useEffect(() => {
    let disposed = false;
    let player: ShakaPlayer | null = null;
    let selectedPlaybackPath: PlaybackPath = "Unknown";
    playbackFailuresRef.current = [];
    playbackPathRef.current = "Unknown";
    nativeHlsFallbackAttemptedRef.current = false;
    nativeHlsFallbackInProgressRef.current = false;
    playbackFailedRef.current = false;
    hasStartedPlaybackRef.current = false;
    nativeTrackIdsRef.current = new WeakMap();
    nextNativeTrackIdRef.current = 0;
    setTracks([]);
    setVariantTracks([]);
    setAudioLanguages([]);
    setSelectedAudioLanguage("");
    setQualityHeights([]);
    setQualityChoice("auto");
    setPlaybackSpeed(1);
    setSoundMissing(false);
    setError(null);
    setDiagnosticCopyMessage(null);
    const videoRefValue = videoRef.current;
    if (!videoRefValue) return;
    const video: HTMLVideoElement = videoRefValue;
    if (castingDevice) return;

    // With a custom User-Agent, requests go through the backend proxy so the header can be set.
    let proxy: string | undefined;
    let mediaUrl = item.streamUrl;
    let liveStartRecorded = false;
    const onPlaying = () => {
      playbackFailedRef.current = false;
      hasStartedPlaybackRef.current = true;
      setStatus("Playing");
      window.setTimeout(() => {
        if (!disposed && !video.paused && soundIsMissing(video)) setSoundMissing(true);
      }, 4000);
      if (item.live && !liveStartRecorded) {
        liveStartRecorded = true;
        onStartedRef.current?.(item);
      }
    };
    const onWaiting = () => {
      if (!playbackFailedRef.current) setStatus("Buffering…");
    };
    const onStalled = () => {
      if (!playbackFailedRef.current) setStatus("Waiting for stream data…");
    };
    const onCanPlay = () => {
      if (!playbackFailedRef.current) setStatus(video.paused ? "Ready to play" : "Playing");
    };
    const onPause = () => {
      if (hasStartedPlaybackRef.current && !video.ended && !playbackFailedRef.current) {
        setStatus("Paused");
      }
    };
    const onVideoError = () => {
      if (nativeHlsFallbackInProgressRef.current) return;
      const code = video.error?.code;
      showPlaybackFailure(
        playbackErrorMessage(code === undefined ? null : { code }),
        "Native media element",
        code === undefined ? undefined : { code },
      );
    };
    const onTimeUpdate = () => {
      if (item.live || item.replay || video.currentTime < 1) return;
      const now = Date.now();
      if (now - lastSaveRef.current < 10_000) return;
      lastSaveRef.current = now;
      void persistProgress();
    };
    const onEnded = () => {
      setStatus("Playback finished");
      void persistProgress(true);
    };
    const onTrackListChange = () => syncNativeTracks();
    const onShakaTracksChanged = () => {
      if (player) {
        syncTracks(player);
        syncVariantTracks(player);
      }
    };
    video.addEventListener("error", onVideoError);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadedmetadata", onTrackListChange);
    for (const event of NATIVE_TRACK_EVENTS) {
      video.textTracks.addEventListener(event, onTrackListChange);
    }

    async function fallbackToNativeHls() {
      nativeHlsFallbackAttemptedRef.current = true;
      nativeHlsFallbackInProgressRef.current = true;
      try {
        const failedPlayer = player;
        if (failedPlayer) {
          await failedPlayer.destroy();
          if (player === failedPlayer) player = null;
          if (playerRef.current === failedPlayer) playerRef.current = null;
        }
        if (disposed) return;
        video.removeAttribute("src");
        video.load();
        selectedPlaybackPath = "Native media element";
        playbackPathRef.current = selectedPlaybackPath;
        video.src = mediaUrl;
        video.load();
        await video.play();
        if (disposed) return;
        setError(null);
        setDiagnosticCopyMessage(null);
        setStatus(video.paused ? "Ready to play" : "Playing");
      } catch (cause) {
        if (!disposed) {
          showPlaybackFailure(
            playbackErrorMessage(cause),
            "Native media element",
            cause,
          );
        }
      } finally {
        nativeHlsFallbackInProgressRef.current = false;
      }
    }

    function handleShakaFailure(cause: unknown) {
      if (nativeHlsFallbackAttemptedRef.current) return;
      if (
        shouldAttemptNativeHlsFallback(
          cause,
          item.streamUrl,
          inspectPlaybackCapabilities(video).nativeHlsSupport,
          Boolean(item.drmLicenseUrl),
        )
      ) {
        recordPlaybackFailure("Shaka Player", cause);
        void fallbackToNativeHls();
        return;
      }
      showPlaybackFailure(playbackErrorMessage(cause), "Shaka Player", cause);
    }

    async function load() {
      try {
        if (!item.offline && usesNativeTransport(item.userAgent)) {
          proxy = await proxyBase(item.userAgent!);
          mediaUrl = proxiedUrl(proxy, item.streamUrl);
        }
        if (disposed) return;
        // Playlists that are not direct files need Shaka when proxied: native HLS would resolve segment addresses against the proxy.
        if (
          item.offline ||
          !item.drmLicenseUrl &&
          (directMediaUrl(item.streamUrl) || item.direct || (!proxy && nativeHlsUrl(item.streamUrl, video)))
        ) {
          selectedPlaybackPath = "Native media element";
          playbackPathRef.current = selectedPlaybackPath;
          const seek = () => {
            if (resumePositionMillis > 0 && Number.isFinite(video.duration)) {
              video.currentTime = Math.min(resumePositionMillis / 1000, Math.max(video.duration - 1, 0));
            }
          };
          video.addEventListener("loadedmetadata", seek, { once: true });
          video.src = mediaUrl;
          video.load();
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
          setStatus("Ready to play");
          void restoreSubtitle(() => disposed);
          return;
        }
        selectedPlaybackPath = "Shaka Player";
        playbackPathRef.current = selectedPlaybackPath;
        const shakaModule = await import("shaka-player");
        if (disposed) return;
        const shakaRuntime = shakaModule.default as ShakaRuntime;
        shakaRuntime.polyfill.installAll();
        if (!shakaRuntime.Player.isBrowserSupported()) {
          throw new Error("This app's webview does not support the streaming formats required by this source.");
        }
        player = new shakaRuntime.Player();
        playerRef.current = player;
        await player.attach(video);
        if (disposed) return;
        player.addEventListener("error", (event: Event) => {
          handleShakaFailure((event as CustomEvent<unknown>).detail);
        });
        player.addEventListener("trackschanged", onShakaTracksChanged);
        if (item.drmLicenseUrl) {
          const licenseUrl = item.drmLicenseUrl;
          const drmSystem = item.drmSystem;
          if (!drmSystem) throw new Error("This protected stream has no configured DRM system.");
          const systems = drmSystem === "com.apple.fps"
            ? ["com.apple.fps", "com.apple.fps.1_0"]
            : [drmSystem];
          const servers = Object.fromEntries(systems.map((system) => [system, licenseUrl]));
          const drm: {
            servers: Record<string, string>;
            advanced?: Record<string, { serverCertificateUri: string }>;
          } = { servers };
          const certificateUrl = item.drmCertificateUrl;
          if (certificateUrl) {
            drm.advanced = Object.fromEntries(systems.map((system) => [
                system,
                { serverCertificateUri: certificateUrl },
              ]));
          }
          if (!player.configure({ drm })) throw new Error("This app's webview rejected the DRM configuration.");
        }
        if (proxy) {
          const base = proxy;
          // Manifest (0), segment (1), timing (4) and key (6) requests go to the provider; licence requests do not.
          const engine = player.getNetworkingEngine();
          engine?.registerRequestFilter((type, request) => {
            if ([0, 1, 4, 6].includes(type)) request.uris = request.uris.map((uri) => proxiedUrl(base, uri));
          });
          // Relative segment addresses in a playlist resolve against the response address, so give back the real one.
          engine?.registerResponseFilter((_type, response) => {
            if (!response.uri.startsWith(base)) return;
            response.uri = response.headers["x-final-url"] ?? new URL(response.uri).searchParams.get("u") ?? response.uri;
          });
        }
        await player.load(item.streamUrl);
        if (disposed) return;
        if (resumePositionMillis > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(resumePositionMillis / 1000, Math.max(video.duration - 1, 0));
        }
        syncTracks(player);
        syncVariantTracks(player);
        setStatus(video.paused ? "Ready to play" : "Playing");
        void restoreSubtitle(() => disposed);
      } catch (cause) {
        if (disposed || nativeHlsFallbackAttemptedRef.current) return;
        if (selectedPlaybackPath === "Shaka Player") handleShakaFailure(cause);
        else showPlaybackFailure(playbackErrorMessage(cause), selectedPlaybackPath, cause);
      }
    }

    void load();
    return () => {
      disposed = true;
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", onTrackListChange);
      for (const event of NATIVE_TRACK_EVENTS) {
        video.textTracks.removeEventListener(event, onTrackListChange);
      }
      video.querySelectorAll("track[data-tivihub-subtitle]").forEach((track) => track.remove());
      for (const url of subtitleUrlsRef.current) URL.revokeObjectURL(url);
      subtitleUrlsRef.current = [];
      attachedSubtitlesRef.current.clear();
      if (player && playerRef.current === player) {
        void player.destroy().catch((cause: unknown) => console.error("Could not close media player", cause));
      }
      playerRef.current = null;
      if (item.offline) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [item.id, item.streamUrl, item.drmLicenseUrl, item.drmSystem, item.drmCertificateUrl, item.live, item.offline, item.userAgent, resumePositionMillis, castingDevice]);

  function selectQuality(value: string) {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (value === "auto") {
        if (!player.configure({ abr: { enabled: true } })) {
          throw new Error("The streaming player rejected automatic quality selection.");
        }
      } else {
        const height = Number(value);
        const choices = variantTracks.filter((track) =>
          track.height === height && (!selectedAudioLanguage || track.language === selectedAudioLanguage),
        );
        const track = choices[0] ?? variantTracks.find((candidate) => candidate.height === height);
        if (!track) throw new Error("That video quality is no longer available.");
        if (!player.configure({ abr: { enabled: false } })) {
          throw new Error("The streaming player rejected manual quality selection.");
        }
        player.selectVariantTrack(track, true, 0);
      }
      setQualityChoice(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change video quality.");
    }
  }

  function selectAudioLanguage(language: string) {
    const player = playerRef.current;
    if (!player) return;
    try {
      const activeTrack = variantTracks.find((track) => track.active);
      const selectedTrack = variantTracks.find((track) =>
        track.language === language && track.height === activeTrack?.height,
      ) ?? variantTracks.find((track) => track.language === language);
      if (!selectedTrack) throw new Error("That audio track is no longer available.");
      player.selectVariantTrack(selectedTrack, true, 0);
      setSelectedAudioLanguage(language);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not change audio track: ${cause.message}` : "Could not change audio track.");
    }
  }

  function selectSubtitleTrack(value: string) {
    const selectedId = value === "" ? null : Number(value);
    if (playerRef.current) {
      playerRef.current.selectTextTrack(tracks.find((track) => track.id === selectedId) ?? null);
      syncTracks(playerRef.current);
      return;
    }
    const video = videoRef.current;
    if (video) Array.from(video.textTracks)
      .filter((track) => track.kind === "captions" || track.kind === "subtitles")
      .forEach((track) => {
        track.mode = nativeTrackIdsRef.current.get(track) === selectedId ? "showing" : "disabled";
      });
    syncNativeTracks();
  }

  async function searchSubtitles() {
    setSubtitleBusy(true);
    setSubtitleError(null);
    setSubtitleResults([]);
    try {
      setSubtitleResults(await subtitleService.search(subtitleApiKey, subtitleQuery));
    } catch (cause) {
      setSubtitleError(cause instanceof Error ? cause.message : "Couldn't search for subtitles. Please try again.");
    } finally {
      setSubtitleBusy(false);
    }
  }

  // Selects an already attached subtitle again instead of adding a duplicate track.
  async function attachSubtitle(name: string, contents: string, fileId?: number) {
    const existing = fileId === undefined ? undefined : attachedSubtitlesRef.current.get(fileId);
    if (existing) {
      existing();
      return;
    }
    const player = playerRef.current;
    const blob = new Blob([asWebVtt(contents)], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    subtitleUrlsRef.current.push(url);
    if (player) {
      const track = await player.addTextTrackAsync(url, "und", "subtitles", "text/vtt", undefined, name);
      player.selectTextTrack(track);
      if (fileId !== undefined) attachedSubtitlesRef.current.set(fileId, () => { player.selectTextTrack(track); syncTracks(player); });
      syncTracks(player);
      return;
    }
    const video = videoRef.current;
    if (!video) throw new Error("The video element is not available.");
    const track = document.createElement("track");
    track.dataset.tivihubSubtitle = "true";
    track.kind = "subtitles";
    track.label = name;
    track.srclang = "und";
    track.default = true;
    track.src = url;
    track.addEventListener("load", () => {
      track.track.mode = "showing";
      syncNativeTracks();
    }, { once: true });
    video.append(track);
    if (fileId !== undefined) attachedSubtitlesRef.current.set(fileId, () => { track.track.mode = "showing"; syncNativeTracks(); });
    syncNativeTracks();
  }

  // `stale` stops a load that was replaced mid-restore from attaching onto the newer player.
  async function restoreSubtitle(stale: () => boolean) {
    for (const fileId of await subtitleService.choices(item.id)) {
      try {
        const subtitle = await subtitleService.cachedFile(fileId);
        if (subtitle && !stale()) await attachSubtitle(subtitle.name, subtitle.contents, fileId);
      } catch (cause) {
        console.error("Could not restore a saved subtitle", cause);
      }
    }
  }

  useEffect(() => {
    if (subtitleOpen) void refreshSavedSubtitles();
  }, [subtitleOpen, item.id]);

  async function refreshSavedSubtitles() {
    setSavedSubtitles(await subtitleService.saved(item.id));
  }

  async function applySavedSubtitle(fileId: number) {
    setSubtitleError(null);
    try {
      const subtitle = await subtitleService.cachedFile(fileId);
      if (!subtitle) throw new Error("Subtitle is no longer cached.");
      await attachSubtitle(subtitle.name, subtitle.contents, fileId);
      setSubtitleOpen(false);
    } catch {
      setSubtitleError("Couldn't add this saved subtitle. Search for it again.");
    }
  }

  async function forgetSavedSubtitle(fileId: number) {
    await subtitleService.forgetChoice(item.id, fileId);
    await refreshSavedSubtitles();
  }

  async function importSubtitle(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSubtitleError(null);
    if (file.size > MAX_SUBTITLE_BYTES) {
      setSubtitleError("Subtitle files are limited to 5 MB.");
      return;
    }
    try {
      await attachSubtitle(file.name, await file.text());
    } catch {
      setSubtitleError("Couldn't add this subtitle file. Check the file and try again.");
    }
  }

  async function downloadSubtitle(result: SubtitleResult) {
    setSubtitleBusy(true);
    setSubtitleError(null);
    try {
      const subtitle = await subtitleService.download(subtitleApiKey, result.fileId);
      await attachSubtitle(subtitle.name, subtitle.contents, result.fileId);
      await subtitleService.rememberChoice(item.id, result.fileId);
      setSubtitleOpen(false);
    } catch {
      setSubtitleError("Couldn't download this subtitle. Please try again.");
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function openCastPanel() {
    setCastOpen(true);
    setCastError(null);
    if (item.drmLicenseUrl) {
      setCastError("Casting DRM-protected streams is not supported yet.");
      return;
    }

    setCastBusy(true);
    setCastDevices([]);
    try {
      setCastDevices(await invoke<CastDeviceInfo[]>("discover_cast_devices"));
    } catch {
      setCastError("Couldn't search for casting devices. Check that they're on the same network and try again.");
    } finally {
      setCastBusy(false);
    }
  }

  async function castToDevice(device: CastDeviceInfo) {
    setCastBusy(true);
    setCastError(null);
    const video = videoRef.current;
    const wasPlaying = Boolean(video && !video.paused);
    video?.pause();
    let castStarted = false;
    try {
      await invoke("cast_media", {
        address: device.address,
        streamUrl: item.streamUrl,
        title: item.title,
        live: item.live,
      });
      castStarted = true;
      let localStopFailed = false;
      const player = playerRef.current;
      if (player) {
        try {
          await player.destroy();
          if (playerRef.current === player) playerRef.current = null;
        } catch (cause) {
          console.error("Could not stop local playback after casting", cause);
          localStopFailed = true;
        }
      }
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      setCastingDevice(device);
      setStatus(`Casting to ${device.name}`);
      if (localStopFailed) {
        setCastError("Casting started, but playback on this device may still be active.");
      }
    } catch {
      if (!castStarted && wasPlaying && video) {
        try {
          await video.play();
        } catch {
          setCastError("Casting didn't start, and playback couldn't resume on this device.");
          return;
        }
      }
      setCastError("Couldn't start casting. Check that the device and stream are available, then try again.");
    } finally {
      setCastBusy(false);
    }
  }

  async function stopCasting(): Promise<boolean> {
    if (!castingDevice) return false;
    setCastBusy(true);
    setCastError(null);
    try {
      await invoke("stop_cast", { address: castingDevice.address });
      setCastingDevice(null);
      setStatus("Connecting to your source…");
      return true;
    } catch {
      setCastError("Couldn't stop casting on that device. Please try again.");
      setCastOpen(true);
      return false;
    } finally {
      setCastBusy(false);
    }
  }

  async function close() {
    if (!castingDevice) await persistProgress();
    if (castingDevice && !(await stopCasting())) return;
    onCloseRef.current();
  }
  closeRef.current = close;

  async function retryPlayback() {
    const video = videoRef.current;
    if (!video) return;
    const player = playerRef.current;
    const resumeAt = !item.live && Number.isFinite(video.currentTime) && video.currentTime > 0
      ? video.currentTime
      : resumePositionMillis / 1000;
    playbackFailedRef.current = false;
    hasStartedPlaybackRef.current = false;
    setError(null);
    setDiagnosticCopyMessage(null);
    setStatus("Retrying playback…");
    try {
      if (player) {
        player.retryStreaming();
      } else {
        if (resumeAt > 0) {
          video.addEventListener("loadedmetadata", () => {
            if (Number.isFinite(video.duration)) {
              video.currentTime = Math.min(resumeAt, Math.max(video.duration - 1, 0));
            }
          }, { once: true });
        }
        video.load();
      }
      await video.play();
      video.focus();
    } catch (cause) {
      showPlaybackFailure(playbackErrorMessage(cause), playbackPathRef.current, cause);
    }
  }

  const playerContent = (
      <section
        aria-labelledby="playback-title"
        aria-modal={inline ? undefined : true}
        className={`playback-dialog${inline ? " playback-inline" : ""}${mini ? " playback-mini" : ""}${item.radio ? " is-radio" : ""}`}
        ref={dialogRef}
        role={inline ? "region" : "dialog"}
      >
        {/* First, so a message at the bottom of the player is its last child (see the notice spacing in styles.css). */}
        <input accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={(event) => void importSubtitle(event)} ref={importInputRef} type="file" />
        <header className="playback-header">
          <div>
            <h2 id="playback-title">
              {item.title}
            </h2>
            <p aria-live="polite" className="playback-status" role="status">
              {/* shortcut: keyed on the initial status text, switch to a status enum if more phases need a skeleton */}
              {status.startsWith("Preparing") ? <><span className="sr-only">{status}</span><Skeleton className="skeleton-line playback-status-skeleton" /></> : status}
            </p>
          </div>
          <div className="playback-header-actions">
            {castingDevice && (
              <button
                className="secondary-button"
                disabled={castBusy}
                onClick={() => void stopCasting()}
                type="button"
              >
                <Icon name="cast_connected" />
                Stop casting
              </button>
            )}
            {mini && onExpand && (
              <button aria-label="Return to live channel" className="icon-button" onClick={onExpand} type="button">
                <Icon name="fullscreen" />
              </button>
            )}
            <button aria-label="Close player" className="icon-button" onClick={() => void close()} type="button">
              <Icon name="close" />
            </button>
          </div>
        </header>
        {item.radio && !mini && (
          <div className="playback-radio-art">
            {item.artworkUrl ? (
              <img alt="" onError={(event) => { event.currentTarget.hidden = true; }} src={item.artworkUrl} />
            ) : <Icon name="radio" />}
          </div>
        )}
        <video
          autoPlay
                    playsInline
          ref={videoRef}
          style={castingDevice ? { visibility: "hidden" } : undefined}
        />
        {!error && !castingDevice && /^(Preparing|Retrying|Connecting|Buffering|Waiting)/.test(status) && (
          <ProgressIndicator className="player-loading" label={item.replay ? "Preparing the recording" : "Loading the stream"} />
        )}
        <PlayerControls trailing={isTauri() && !item.offline ? (
            <button
              aria-expanded={castOpen}
              aria-label={castingDevice ? `Casting to ${castingDevice.name}` : "Cast"}
              className={`icon-button${castingDevice ? " selected" : ""}`}
              data-tooltip={castingDevice ? `Casting to ${castingDevice.name}` : "Cast"}
              onClick={() => {
                if (castOpen) setCastOpen(false);
                else void openCastPanel();
              }}
              type="button"
            >
              <Icon name={castingDevice ? "cast_connected" : "cast"} />
            </button>
          ) : undefined} badge={item.live ? <span className="playback-badge">{item.radio ? "Radio" : "Live"}</span> : undefined} fullscreenRef={dialogRef} live={item.live} videoRef={videoRef}>
            <PlayerMenu
              actions={item.live ? [] : [
                { label: "Import subtitle file…", icon: "library_add", onClick: () => importInputRef.current?.click() },
                { label: "Search OpenSubtitles…", icon: "search", onClick: () => setSubtitleOpen((open) => !open) },
              ]}
              sections={[
                ...(item.live ? [] : [{
                  title: "Subtitles",
                  options: [
                    { label: "Subtitles off", value: "", active: !tracks.some((track) => track.active) },
                    ...tracks.map((track) => ({ label: track.label, value: String(track.id), active: track.active })),
                  ],
                  onSelect: selectSubtitleTrack,
                }]),
                ...(audioLanguages.length > 1 ? [{
                  title: "Audio",
                  options: audioLanguages.map((track) => ({ label: track.label, value: track.language, active: track.language === selectedAudioLanguage })),
                  onSelect: selectAudioLanguage,
                }] : []),
                ...(qualityHeights.length > 1 ? [{
                  title: "Quality",
                  options: [
                    { label: "Auto", value: "auto", active: qualityChoice === "auto" },
                    ...qualityHeights.map((height) => ({ label: `${height}p`, value: String(height), active: qualityChoice === String(height) })),
                  ],
                  onSelect: selectQuality,
                }] : []),
              ]}
            />
            {!item.live && (
              <div className="player-track-select">
                <Icon name="speed" />
                <CustomSelect
                  ariaLabel="Playback speed"
                  onValueChange={(value) => {
                    const speed = Number(value);
                    const video = videoRef.current;
                    if (!video || !Number.isFinite(speed)) return;
                    try {
                      video.playbackRate = speed;
                      setPlaybackSpeed(speed);
                    } catch (cause) {
                      setError(cause instanceof Error ? `Could not change playback speed: ${cause.message}` : "Could not change playback speed.");
                    }
                  }}
                  options={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => ({
                    label: speed === 1 ? "Normal speed" : `${speed}×`,
                    value: String(speed),
                  }))}
                  value={String(playbackSpeed)}
                  variant="embedded"
                />
              </div>
            )}
            {onOpenExternal && !item.offline && !item.drmLicenseUrl && (
              <button
                aria-label="Open in VLC or mpv"
                className="icon-button"
                data-tooltip="Open in VLC or mpv"
                onClick={() => onOpenExternal(item)}
                type="button"
              >
                <Icon name="open_in_new" />
              </button>
            )}
          </PlayerControls>
        {castingDevice && (
          <div className="player-casting-status" role="status">
            <Icon name="cast_connected" />
            <div>
              <strong>Playing on your TV</strong>
              <span>{castingDevice.name}</span>
              {castError && <span className="player-casting-warning">{castError}</span>}
            </div>
          </div>
        )}
        {soundMissing && !error && (
          <p className="player-error" role="status">
            This file has no sound in the built-in player: its audio (usually AC-3 or E-AC-3) cannot be decoded here.
            {onOpenExternal && " Use the Open in VLC or mpv button in the player controls to watch it with sound."}
          </p>
        )}
        {error && <p className="player-error" role="alert">{error}</p>}
        {error && (
          <div className="playback-error-actions">
            <button className="secondary-button" onClick={() => void retryPlayback()} type="button">
              <Icon name="refresh" />
              Retry playback
            </button>
            <button className="secondary-button" onClick={() => void close()} type="button">
              <Icon name="arrow_back" />
              Return to browsing
            </button>
            <button className="text-button" onClick={() => void copyDiagnostics()} type="button">
              <Icon name="content_copy" />
              Copy error details
            </button>
            {diagnosticCopyMessage && (
              <p aria-live="polite" className="playback-error-copy-status">{diagnosticCopyMessage}</p>
            )}
          </div>
        )}
        {saveError && <p className="player-error" role="alert">{saveError}</p>}

        {castOpen && (
          <div className="player-overlay" onClick={(event) => { if (event.target === event.currentTarget) setCastOpen(false); }}>
            <section aria-label="Cast to a device" className="player-overlay-card" role="dialog">
              <header className="player-overlay-header">
                <h3>Cast to a device</h3>
                <button aria-label="Close casting" className="icon-button" onClick={() => setCastOpen(false)} type="button">
                  <Icon name="close" />
                </button>
              </header>
              <CastPanel
                castBusy={castBusy}
                castDevices={castDevices}
                castError={castError}
                castingDevice={castingDevice}
                castToDevice={castToDevice}
                copyDiagnostics={copyDiagnostics}
                diagnosticCopyMessage={diagnosticCopyMessage}
                drm={Boolean(item.drmLicenseUrl)}
                openCastPanel={openCastPanel}
              />
            </section>
          </div>
        )}

        {!item.live && subtitleOpen && (
          <div className="player-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSubtitleOpen(false); }}>
            <section aria-label="Subtitles" className="player-overlay-card" role="dialog">
              <header className="player-overlay-header">
                <h3>Subtitles</h3>
                <button aria-label="Close subtitle search" className="icon-button" onClick={() => setSubtitleOpen(false)} type="button">
                  <Icon name="close" />
                </button>
              </header>
              <SubtitlePanel
                applySavedSubtitle={applySavedSubtitle}
                downloadSubtitle={downloadSubtitle}
                forgetSavedSubtitle={forgetSavedSubtitle}
                savedSubtitles={savedSubtitles}
                searchSubtitles={searchSubtitles}
                setSubtitleQuery={setSubtitleQuery}
                subtitleApiKey={subtitleApiKey}
                subtitleBusy={subtitleBusy}
                subtitleError={subtitleError}
                subtitleQuery={subtitleQuery}
                subtitleResults={subtitleResults}
              />
            </section>
          </div>
        )}
      </section>
  );
  return inline ? playerContent : (
    <div className="modal-backdrop playback-backdrop" role="presentation">
      {playerContent}
    </div>
  );
}
