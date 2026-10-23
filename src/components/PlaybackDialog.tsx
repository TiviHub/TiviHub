import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import webPackage from "../../package.json";
import type { PlayableItem } from "../types";
import type { SubtitleResult } from "../providers/opensubtitles";
import { subtitleService } from "../subtitleService";
import { playbackErrorMessage } from "../playbackErrors";
import {
  browserSummary,
  createPlaybackDiagnosticReport,
  inspectPlaybackCapabilities,
  playbackDiagnosticError,
  shouldAttemptNativeHlsFallback,
  type BackendDiagnosticEvent,
  type PlaybackDiagnosticFailure,
  type PlaybackPath,
} from "../playbackDiagnostics";
import { CustomSelect, Icon } from "./common";
import { RowSkeletons, Skeleton } from "./Skeleton";

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
const NATIVE_TRACK_EVENTS = ["addtrack", "removetrack", "change", "labelchange"] as const;

interface TextTrackOption {
  id: number;
  label: string;
  language: string;
  active: boolean;
}

interface ShakaTextTrack {
  id: number;
  label: string;
  language: string;
  active: boolean;
}

interface ShakaVariantTrack {
  id: number;
  active: boolean;
  language: string;
  label?: string;
  audioId?: number;
  height?: number;
  bandwidth?: number;
}

interface ShakaPlayer {
  attach(video: HTMLVideoElement): Promise<unknown>;
  addEventListener(type: string, listener: EventListener): void;
  configure(configuration: object): boolean;
  load(uri: string): Promise<unknown>;
  retryStreaming(): void;
  getTextTracks(): ShakaTextTrack[];
  getVariantTracks(): ShakaVariantTrack[];
  selectTextTrack(track?: ShakaTextTrack | null): void;
  selectVariantTrack(track: ShakaVariantTrack, clearBuffer?: boolean, safeMargin?: number): void;
  addTextTrackAsync(
    uri: string,
    language: string,
    kind: string,
    mimeType?: string,
    codec?: string,
    label?: string,
    forced?: boolean,
  ): Promise<ShakaTextTrack>;
  destroy(): Promise<void>;
}

interface ShakaRuntime {
  polyfill: { installAll(): void };
  Player: {
    new (): ShakaPlayer;
    isBrowserSupported(): boolean;
  };
}

interface CastDeviceInfo {
  address: string;
  name: string;
}

function mediaDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
}

function directMediaUrl(value: string): boolean {
  try {
    return /\.(mp4|m4v|webm|mov|ogv|ogg)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function nativeHlsUrl(value: string, video: HTMLVideoElement): boolean {
  try {
    return /\.m3u8$/i.test(new URL(value).pathname) &&
      navigator.vendor === "Apple Computer, Inc." &&
      video.canPlayType("application/vnd.apple.mpegurl") !== "";
  } catch {
    return false;
  }
}

function asWebVtt(contents: string): string {
  const normalized = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^\s*WEBVTT(?:\s|$)/i.test(normalized)) return normalized;
  const cues = normalized.replace(
    /^(\d{2}:\d{2}:\d{2}),(\d{3})(\s+-->\s+\d{2}:\d{2}:\d{2}),(\d{3})/gm,
    "$1.$2$3.$4",
  );
  return `WEBVTT\n\n${cues}`;
}

export function PlaybackDialog({
  item,
  inline = false,
  mini = false,
  subtitleApiKey,
  resumePositionMillis,
  onExpand,
  onClose,
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
    setError(null);
    setDiagnosticCopyMessage(null);
    const videoRefValue = videoRef.current;
    if (!videoRefValue) return;
    const video: HTMLVideoElement = videoRefValue;
    if (castingDevice) return;

    let liveStartRecorded = false;
    const onPlaying = () => {
      playbackFailedRef.current = false;
      hasStartedPlaybackRef.current = true;
      setStatus("Playing");
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
        video.src = item.streamUrl;
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
        if (
          item.offline ||
          !item.drmLicenseUrl &&
          (directMediaUrl(item.streamUrl) || nativeHlsUrl(item.streamUrl, video))
        ) {
          selectedPlaybackPath = "Native media element";
          playbackPathRef.current = selectedPlaybackPath;
          const seek = () => {
            if (resumePositionMillis > 0 && Number.isFinite(video.duration)) {
              video.currentTime = Math.min(resumePositionMillis / 1000, Math.max(video.duration - 1, 0));
            }
          };
          video.addEventListener("loadedmetadata", seek, { once: true });
          video.src = item.streamUrl;
          video.load();
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
          setStatus("Ready to play");
          void restoreSubtitle(() => disposed);
          return;
        }
        selectedPlaybackPath = "Shaka Player";
        playbackPathRef.current = selectedPlaybackPath;
        selectedPlaybackPath = "Shaka Player";
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
  }, [item.id, item.streamUrl, item.drmLicenseUrl, item.drmSystem, item.drmCertificateUrl, item.live, item.offline, resumePositionMillis, castingDevice]);

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
        <header className="playback-header">
          <div>
            <h2 id="playback-title">
              {item.live && <span className="playback-badge">{item.radio ? "Radio" : "Live"}</span>}
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
          controls
          playsInline
          ref={videoRef}
          style={castingDevice ? { visibility: "hidden" } : undefined}
        />
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
        <div className="player-tools">
          <div className="player-track-select">
            <Icon name="subtitles" />
            <CustomSelect
              ariaLabel="Subtitle track"
              onValueChange={(value) => {
                const selectedId = value === "" ? null : Number(value);
                if (playerRef.current) {
                  playerRef.current.selectTextTrack(
                    tracks.find((track) => track.id === selectedId) ?? null,
                  );
                  syncTracks(playerRef.current);
                } else {
                  const video = videoRef.current;
                  if (video) Array.from(video.textTracks)
                    .filter((track) => track.kind === "captions" || track.kind === "subtitles")
                    .forEach((track) => {
                      track.mode = nativeTrackIdsRef.current.get(track) === selectedId ? "showing" : "disabled";
                    });
                  syncNativeTracks();
                }
              }}
              options={[
                { label: "Subtitles off", value: "" },
                ...tracks.map((track) => ({ label: track.label, value: String(track.id) })),
              ]}
              value={String(tracks.find((track) => track.active)?.id ?? "")}
              variant="embedded"
            />
          </div>
          {audioLanguages.length > 1 && (
            <div className="player-track-select">
              <Icon name="graphic_eq" />
              <CustomSelect
                ariaLabel="Audio track"
                onValueChange={selectAudioLanguage}
                options={audioLanguages.map((track) => ({ label: track.label, value: track.language }))}
                value={selectedAudioLanguage}
                variant="embedded"
              />
            </div>
          )}
          {qualityHeights.length > 1 && (
            <div className="player-track-select">
              <Icon name="high_quality" />
              <CustomSelect
                ariaLabel="Video quality"
                onValueChange={selectQuality}
                options={[
                  { label: "Auto quality", value: "auto" },
                  ...qualityHeights.map((height) => ({ label: `${height}p`, value: String(height) })),
                ]}
                value={qualityChoice}
                variant="embedded"
              />
            </div>
          )}
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
          {!item.live && (
            <>
              <label className="secondary-button subtitle-file-button">
                <Icon name="library_add" />
                Import subtitle
                <input accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={(event) => void importSubtitle(event)} type="file" />
              </label>
              <button className="secondary-button" onClick={() => setSubtitleOpen((open) => !open)} type="button">
                <Icon name="search" />
                OpenSubtitles
              </button>
            </>
          )}
          {isTauri() && !item.offline && (
            <button
              aria-expanded={castOpen}
              className="secondary-button"
              onClick={() => {
                if (castOpen) setCastOpen(false);
                else void openCastPanel();
              }}
              type="button"
            >
              <Icon name="cast" />
              {castingDevice ? `Casting to ${castingDevice.name}` : "Cast"}
            </button>
          )}
        </div>

        {castOpen && (
          <section aria-label="Cast to a device" className="cast-panel">
            <div className="cast-panel-heading">
              <strong>Google Cast devices</strong>
              <button
                className="text-button"
                disabled={castBusy}
                onClick={() => void openCastPanel()}
                type="button"
              >
                {castBusy ? "Searching…" : "Refresh"}
              </button>
            </div>
            {castError && (
              <div className="playback-error-actions">
                <p className="form-error" role="alert">{castError}</p>
                <button className="text-button" onClick={() => void copyDiagnostics()} type="button">
                  <Icon name="content_copy" />
                  Copy error details
                </button>
                {diagnosticCopyMessage && (
                  <p aria-live="polite" className="playback-error-copy-status">{diagnosticCopyMessage}</p>
                )}
              </div>
            )}
            {castBusy && castDevices.length === 0 && (
              <div aria-live="polite" role="status">
                <span className="sr-only">Searching for Google Cast devices…</span>
                <RowSkeletons count={2} />
              </div>
            )}
            {castDevices.length > 0 && (
              <ul className="cast-device-list">
                {castDevices.map((device) => (
                  <li key={device.address}>
                    <button
                      className="secondary-button"
                      disabled={castBusy || Boolean(item.drmLicenseUrl) || Boolean(castingDevice)}
                      onClick={() => void castToDevice(device)}
                      type="button"
                    >
                      <Icon name={castingDevice?.address === device.address ? "cast_connected" : "cast"} />
                      {device.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!castBusy && castDevices.length === 0 && !castError && (
              <p className="form-note">No Chromecast devices found on your local network.</p>
            )}
            <p className="form-note">
              The Chromecast fetches the stream directly from your provider. TiviHub does not relay media.
            </p>
          </section>
        )}

        {!item.live && subtitleOpen && (
          <section className="subtitle-panel" aria-label="Search OpenSubtitles">
            <div className="subtitle-column">
              <strong className="subtitle-column-title">Search OpenSubtitles</strong>
              <form
                className="subtitle-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchSubtitles();
                }}
              >
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    aria-label="Subtitle search"
                    onChange={(event) => setSubtitleQuery(event.target.value)}
                    placeholder="Movie or episode title"
                    value={subtitleQuery}
                  />
                </label>
                <button className="secondary-button selected" disabled={subtitleBusy} type="submit">
                  {subtitleBusy ? "Searching…" : "Search"}
                </button>
              </form>
              {subtitleError && <p className="form-error" role="alert">{subtitleError}</p>}
              {subtitleBusy && subtitleResults.length === 0 && (
                <div aria-live="polite" role="status">
                  <span className="sr-only">Searching subtitles…</span>
                  <RowSkeletons count={3} />
                </div>
              )}
              {subtitleResults.length > 0 && (
                <ul className="subtitle-results">
                  {subtitleResults.slice(0, 20).map((result) => (
                    <li key={`${result.fileId}:${result.fileName}`}>
                      <span>
                        <strong>{result.fileName}</strong>
                        <small>{result.language}{result.release ? ` · ${result.release}` : ""}</small>
                      </span>
                      <button
                        aria-label={`Download ${result.fileName}`}
                        className="icon-button"
                        data-tooltip="Download"
                        disabled={subtitleBusy}
                        onClick={() => void downloadSubtitle(result)}
                        type="button"
                      >
                        <Icon name="download" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!subtitleApiKey && (
                <p className="form-note">Add your API key in Settings to search. You can import a subtitle file without an API key.</p>
              )}
            </div>
            <div className="subtitle-column">
              <strong className="subtitle-column-title">
                Saved downloads
                {savedSubtitles.length > 0 && <span className="subtitle-count">{savedSubtitles.length}</span>}
              </strong>
              {savedSubtitles.length === 0 && (
                <div className="subtitle-empty">
                  <Icon name="subtitles" />
                  <p>Nothing saved yet. Download a subtitle and it will appear here.</p>
                </div>
              )}
              {savedSubtitles.length > 0 && (
                <ul className="subtitle-results">
                  {savedSubtitles.map((saved) => (
                    <li key={saved.fileId}>
                      <span><strong>{saved.name}</strong></span>
                      <button
                        aria-label={`Use ${saved.name}`}
                        className="icon-button"
                        data-tooltip="Use this subtitle"
                        onClick={() => void applySavedSubtitle(saved.fileId)}
                        type="button"
                      >
                        <Icon name="subtitles" />
                      </button>
                      <button
                        aria-label={`Remove ${saved.name}`}
                        className="icon-button"
                        data-tooltip="Remove from this title"
                        onClick={() => void forgetSavedSubtitle(saved.fileId)}
                        type="button"
                      >
                        <Icon name="delete" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
        <p className="player-disclaimer">
          Playback and subtitle requests connect directly to their configured hosts. Availability depends on the webview codecs, CORS, and source permissions.
        </p>
      </section>
  );
  return inline ? playerContent : (
    <div className="modal-backdrop playback-backdrop" role="presentation">
      {playerContent}
    </div>
  );
}
