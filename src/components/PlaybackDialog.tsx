import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { PlayableItem } from "../types";
import { downloadOpenSubtitle, searchOpenSubtitles, type SubtitleResult } from "../providers/opensubtitles";
import { Icon } from "./common";

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

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

interface ShakaPlayer {
  attach(video: HTMLVideoElement): Promise<unknown>;
  addEventListener(type: string, listener: EventListener): void;
  configure(configuration: object): boolean;
  load(uri: string): Promise<unknown>;
  getTextTracks(): ShakaTextTrack[];
  selectTextTrack(track?: ShakaTextTrack | null): void;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "number") {
    return `The browser or provider rejected playback (media error ${error.code}). Check the stream format, CORS access, and DRM configuration.`;
  }
  return "Playback could not be started.";
}

export function PlaybackDialog({
  item,
  subtitleApiKey,
  resumePositionMillis,
  onClose,
  onProgress,
}: {
  item: PlayableItem;
  subtitleApiKey: string;
  resumePositionMillis: number;
  onClose: () => void;
  onProgress: (
    item: PlayableItem,
    positionMillis: number,
    durationMillis: number,
    watched?: boolean,
  ) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ShakaPlayer | null>(null);
  const onProgressRef = useRef(onProgress);
  const onCloseRef = useRef(onClose);
  const lastSaveRef = useRef(0);
  const subtitleUrlsRef = useRef<string[]>([]);
  const [status, setStatus] = useState("Connecting to your source…");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TextTrackOption[]>([]);
  const [subtitleQuery, setSubtitleQuery] = useState(item.title);
  const [subtitleResults, setSubtitleResults] = useState<SubtitleResult[]>([]);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [subtitleOpen, setSubtitleOpen] = useState(false);

  onProgressRef.current = onProgress;
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    document.querySelector<HTMLButtonElement>(".playback-dialog .icon-button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  function syncTracks(player: ShakaPlayer) {
    setTracks(player.getTextTracks().map((track) => ({
      id: track.id,
      label: track.label || track.language || "Subtitle",
      language: track.language,
      active: track.active,
    })));
  }

  function syncNativeTracks() {
    const video = videoRef.current;
    if (!video) return;
    setTracks(Array.from(video.textTracks).map((track, id) => ({
      id,
      label: track.label || track.language || "Subtitle",
      language: track.language,
      active: track.mode === "showing",
    })));
  }

  async function persistProgress(watched = false) {
    const video = videoRef.current;
    if (!video || item.live) return;
    try {
      await onProgressRef.current(
        item,
        Math.round(video.currentTime * 1000),
        mediaDuration(video),
        watched,
      );
      setSaveError(null);
    } catch (cause) {
      setSaveError(errorMessage(cause));
    }
  }

  useEffect(() => {
    let disposed = false;
    let player: ShakaPlayer | null = null;
    const videoRefValue = videoRef.current;
    if (!videoRefValue) return;
    const video: HTMLVideoElement = videoRefValue;

    const onVideoError = () => {
      const code = video.error?.code;
      setError(code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? "This browser cannot decode the selected media format."
        : "The media source could not be played. Check that it is online and browser-accessible.");
      setStatus("Playback failed");
    };
    const onTimeUpdate = () => {
      if (item.live || video.currentTime < 1) return;
      const now = Date.now();
      if (now - lastSaveRef.current < 10_000) return;
      lastSaveRef.current = now;
      void persistProgress();
    };
    const onEnded = () => void persistProgress(true);
    const onTrackListChange = () => syncNativeTracks();
    video.addEventListener("error", onVideoError);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadedmetadata", onTrackListChange);
    video.textTracks.addEventListener("addtrack", onTrackListChange);
    video.textTracks.addEventListener("change", onTrackListChange);

    async function load() {
      try {
        if (
          !item.drmLicenseUrl &&
          (directMediaUrl(item.streamUrl) || nativeHlsUrl(item.streamUrl, video))
        ) {
          const seek = () => {
            if (resumePositionMillis > 0 && Number.isFinite(video.duration)) {
              video.currentTime = Math.min(resumePositionMillis / 1000, Math.max(video.duration - 1, 0));
            }
          };
          video.addEventListener("loadedmetadata", seek, { once: true });
          video.src = item.streamUrl;
          video.load();
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
          setStatus("Ready");
          return;
        }

        const shakaModule = await import("shaka-player");
        if (disposed) return;
        const shakaRuntime = shakaModule.default as ShakaRuntime;
        shakaRuntime.polyfill.installAll();
        if (!shakaRuntime.Player.isBrowserSupported()) {
          throw new Error("This browser does not support the streaming formats required by this source.");
        }
        player = new shakaRuntime.Player();
        playerRef.current = player;
        await player.attach(video);
        if (disposed) return;
        player.addEventListener("error", (event: Event) => {
          const shakaError = (event as CustomEvent<{ message?: string; code?: number }>).detail;
          setError(shakaError?.message || "The stream failed. The provider may block browser access, or this DRM/codec may not be supported.");
          setStatus("Playback failed");
        });
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
          if (!player.configure({ drm })) throw new Error("The browser rejected this DRM configuration.");
        }
        await player.load(item.streamUrl);
        if (disposed) return;
        if (resumePositionMillis > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(resumePositionMillis / 1000, Math.max(video.duration - 1, 0));
        }
        syncTracks(player);
        setStatus("Ready");
      } catch (cause) {
        if (!disposed) {
          setError(errorMessage(cause));
          setStatus("Playback failed");
        }
      }
    }

    void load();
    return () => {
      disposed = true;
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", onTrackListChange);
      video.textTracks.removeEventListener("addtrack", onTrackListChange);
      video.textTracks.removeEventListener("change", onTrackListChange);
      video.querySelectorAll("track[data-tivihub-subtitle]").forEach((track) => track.remove());
      for (const url of subtitleUrlsRef.current) URL.revokeObjectURL(url);
      subtitleUrlsRef.current = [];
      if (player) void player.destroy().catch((cause: unknown) => console.error("Could not close media player", cause));
      playerRef.current = null;
    };
  }, [item.id, item.streamUrl, item.drmLicenseUrl, item.drmSystem, item.drmCertificateUrl, item.live, resumePositionMillis]);

  async function searchSubtitles() {
    setSubtitleBusy(true);
    setSubtitleError(null);
    try {
      setSubtitleResults(await searchOpenSubtitles(subtitleApiKey, subtitleQuery));
    } catch (cause) {
      setSubtitleError(errorMessage(cause));
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function attachSubtitle(name: string, contents: string) {
    const player = playerRef.current;
    const blob = new Blob([asWebVtt(contents)], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    subtitleUrlsRef.current.push(url);
    if (player) {
      const track = await player.addTextTrackAsync(url, "und", "subtitles", "text/vtt", undefined, name);
      player.selectTextTrack(track);
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
    syncNativeTracks();
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
    } catch (cause) {
      setSubtitleError(errorMessage(cause));
    }
  }

  async function downloadSubtitle(result: SubtitleResult) {
    setSubtitleBusy(true);
    setSubtitleError(null);
    try {
      const subtitle = await downloadOpenSubtitle(subtitleApiKey, result.fileId);
      await attachSubtitle(subtitle.name, subtitle.contents);
      setSubtitleOpen(false);
    } catch (cause) {
      setSubtitleError(errorMessage(cause));
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function close() {
    await persistProgress();
    onCloseRef.current();
  }

  return (
    <div className="modal-backdrop playback-backdrop" role="presentation">
      <section className="playback-dialog" role="dialog" aria-modal="true" aria-labelledby="playback-title">
        <header className="playback-header">
          <div>
            <p className="eyebrow">{item.live ? "LIVE SIGNAL" : "NOW PLAYING"}</p>
            <h2 id="playback-title">{item.title}</h2>
            <p className="playback-status">{status}</p>
          </div>
          <button aria-label="Close player" className="icon-button" onClick={() => void close()} type="button">
            <Icon name="close" />
          </button>
        </header>
        <video autoPlay controls playsInline ref={videoRef} />
        {error && <p className="player-error" role="alert">{error}</p>}
        {saveError && <p className="player-error" role="alert">Could not save playback progress: {saveError}</p>}
        <div className="player-tools">
          <label className="player-track-select">
            <Icon name="subtitles" />
            <span className="sr-only">Subtitle track</span>
            <select
              aria-label="Subtitle track"
              onChange={(event) => {
                const selectedId = event.target.value === "" ? null : Number(event.target.value);
                if (playerRef.current) {
                  playerRef.current.selectTextTrack(
                    tracks.find((track) => track.id === selectedId) ?? null,
                  );
                  syncTracks(playerRef.current);
                } else {
                  const video = videoRef.current;
                  if (video) Array.from(video.textTracks).forEach((track, index) => {
                    track.mode = index === selectedId ? "showing" : "disabled";
                  });
                  syncNativeTracks();
                }
              }}
              value={tracks.find((track) => track.active)?.id ?? ""}
            >
              <option value="">Subtitles off</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>{track.label}</option>
              ))}
            </select>
            <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
          </label>
          <label className="secondary-button subtitle-file-button">
            <Icon name="library_add" />
            Import subtitle
            <input accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={(event) => void importSubtitle(event)} type="file" />
          </label>
          <button className="secondary-button" onClick={() => setSubtitleOpen((open) => !open)} type="button">
            <Icon name="search" />
            OpenSubtitles
          </button>
        </div>

        {subtitleOpen && (
          <section className="subtitle-panel" aria-label="Search OpenSubtitles">
            <form
              className="subtitle-search"
              onSubmit={(event) => {
                event.preventDefault();
                void searchSubtitles();
              }}
            >
              <input
                aria-label="Subtitle search"
                onChange={(event) => setSubtitleQuery(event.target.value)}
                placeholder="Movie or episode title"
                value={subtitleQuery}
              />
              <button className="primary-button" disabled={subtitleBusy} type="submit">
                {subtitleBusy ? "Searching…" : "Search"}
              </button>
            </form>
            {subtitleError && <p className="form-error" role="alert">{subtitleError}</p>}
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
          </section>
        )}
        <p className="player-disclaimer">
          Playback and subtitle requests connect directly to their configured hosts. Availability depends on browser codecs, CORS, and source permissions.
        </p>
      </section>
    </div>
  );
}
