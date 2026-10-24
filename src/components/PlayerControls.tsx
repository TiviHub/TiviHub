import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Icon } from "./common";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

/** Our own control bar for the video: play, seek, volume, fullscreen, plus the buttons passed as children (subtitles, cast). */
export function PlayerControls({
  videoRef,
  fullscreenRef,
  badge,
  trailing,
  live,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  fullscreenRef: RefObject<HTMLElement | null>;
  /** Pill shown just left of the volume control. */
  badge?: ReactNode;
  /** Sits last, right of the full screen button. */
  trailing?: ReactNode;
  live: boolean;
  children?: ReactNode;
}) {
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setPaused(video.paused);
      setTime(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const events = ["play", "pause", "timeupdate", "durationchange", "loadedmetadata", "volumechange"];
    for (const name of events) video.addEventListener(name, sync);
    const onFullscreen = () => setFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    sync();
    return () => {
      for (const name of events) video.removeEventListener(name, sync);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [videoRef, fullscreenRef]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void fullscreenRef.current?.requestFullscreen().catch(() => {});
  }

  const silent = muted || volume === 0;
  return (
    <div className={`player-controls${paused ? " is-paused" : ""}`}>
      <button aria-label={paused ? "Play" : "Pause"} className="icon-button" onClick={togglePlay} type="button">
        <Icon name={paused ? "play_arrow" : "pause"} />
      </button>
      {live || duration === 0 ? (
        <>
          {!live && <span className="player-controls-time">{formatClock(time)}</span>}
          <span className="player-controls-spacer" />
        </>
      ) : (
        <>
          <span className="player-controls-time">{formatClock(time)}</span>
          <input
            aria-label="Seek"
            className="player-controls-seek"
            max={duration}
            min={0}
            onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }}
            step="any"
            style={{ "--fill": `${(Math.min(time, duration) / duration) * 100}%` } as CSSProperties}
            type="range"
            value={Math.min(time, duration)}
          />
          <span className="player-controls-time">{formatClock(duration)}</span>
        </>
      )}
      {badge}
      <button
        aria-label={silent ? "Unmute" : "Mute"}
        className="icon-button"
        onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}
        type="button"
      >
        <Icon name={silent ? "volume_off" : "volume_up"} />
      </button>
      <input
        aria-label="Volume"
        className="player-controls-volume"
        max="1"
        min="0"
        onChange={(event) => {
          const video = videoRef.current;
          if (!video) return;
          video.volume = Number(event.target.value);
          video.muted = false;
        }}
        step="0.05"
        style={{ "--fill": `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
        type="range"
        value={muted ? 0 : volume}
      />
      {children}
      <button aria-label={fullscreen ? "Exit full screen" : "Full screen"} className="icon-button player-controls-fullscreen" onClick={toggleFullscreen} type="button">
        <Icon name={fullscreen ? "fullscreen_exit" : "fullscreen"} />
      </button>
      {trailing}
    </div>
  );
}
