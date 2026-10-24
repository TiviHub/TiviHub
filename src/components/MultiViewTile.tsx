import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { playbackErrorMessage } from "../lib/playbackErrors";
import { directMediaUrl, nativeHlsUrl, type ShakaPlayer, type ShakaRuntime } from "../lib/playbackMedia";
import { proxiedUrl, proxyBase, usesNativeTransport } from "../providers/transport";
import { routePlayerThroughProxy } from "../services/playerProxy";
import type { LiveChannel } from "../types";
import { Icon } from "./common";
import { Skeleton } from "./Skeleton";

/** One live channel in the multiview grid: plain streams only (no DRM), with the proxy when the source needs a User-Agent. */
export function MultiViewTile({ channel, userAgent, audible, onSelectAudio, onRemove }: {
  channel: LiveChannel;
  userAgent?: string;
  audible: boolean;
  onSelectAudio: () => void;
  onRemove: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let player: ShakaPlayer | null = null;

    async function load(element: HTMLVideoElement) {
      try {
        let proxy: string | undefined;
        let mediaUrl = channel.streamUrl;
        if (usesNativeTransport(userAgent)) {
          proxy = await proxyBase(userAgent!);
          mediaUrl = proxiedUrl(proxy, channel.streamUrl);
        }
        if (disposed) return;
        if (directMediaUrl(channel.streamUrl) || (!proxy && nativeHlsUrl(channel.streamUrl, element))) {
          element.src = mediaUrl;
          element.load();
          await element.play();
          return;
        }
        const shaka = (await import("shaka-player")).default as ShakaRuntime;
        if (disposed) return;
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) throw new Error(t("play.noStreaming"));
        player = new shaka.Player();
        await player.attach(element);
        if (disposed) return;
        player.addEventListener("error", (event: Event) => {
          if (!disposed) setError(playbackErrorMessage((event as CustomEvent<unknown>).detail));
        });
        if (proxy) routePlayerThroughProxy(player, proxy);
        await player.load(channel.streamUrl);
        if (!disposed) await element.play();
      } catch (cause) {
        if (!disposed) setError(playbackErrorMessage(cause));
      }
    }

    void load(video);
    return () => {
      disposed = true;
      void player?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel.streamUrl, userAgent]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !audible;
  }, [audible]);

  return (
    <article className={`multiview-tile${audible ? " is-audible" : ""}`}>
      <video muted={!audible} onPlaying={() => setReady(true)} playsInline ref={videoRef} />
      {!ready && !error && <Skeleton className="multiview-tile-loading" />}
      {error && <p className="player-error multiview-tile-error" role="alert">{error}</p>}
      <div className="multiview-tile-bar">
        <strong data-tooltip={channel.name}>{channel.name}</strong>
        <button
          aria-label={t("multi.sound", { name: channel.name })}
          aria-pressed={audible}
          className={`icon-button${audible ? " selected" : ""}`}
          data-tooltip={t("multi.sound", { name: channel.name })}
          onClick={onSelectAudio}
          type="button"
        >
          <Icon name={audible ? "volume_up" : "volume_off"} />
        </button>
        <button
          aria-label={t("multi.remove", { name: channel.name })}
          className="icon-button"
          data-tooltip={t("multi.remove", { name: channel.name })}
          onClick={onRemove}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>
    </article>
  );
}
