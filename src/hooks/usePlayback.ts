import { useState, type Dispatch, type SetStateAction } from "react";
import { t } from "../lib/i18n";
import { replayUrl } from "../lib/catchup";
import { canOpenExternally, openInExternalPlayer } from "../services/externalPlayer";
import { isStalkerLink, isStalkerVideoLink, resolveStalkerLink, stalkerUserAgent, warmStalkerSession } from "../providers/stalker";
import { getLibraryItems, saveLibraryItem } from "../storage/database";
import type { EpgProgram, LibraryItem, LiveChannel, PlayableItem, Playlist } from "../types";

interface Options {
  notify: (message: string, kind: "error" | "notice") => void;
  setLibrary: Dispatch<SetStateAction<LibraryItem[]>>;
  sources: Playlist[];
}

export function usePlayback({ notify, setLibrary, sources }: Options) {
  const [playableItem, setPlayableItem] = useState<PlayableItem | null>(null);
  const [inlineLivePlayback, setInlineLivePlayback] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);

  // Offline blob URLs are revoked only when the player leaves; the player effect re-runs on seek/resume.
  function revokeOfflineUrl() {
    if (playableItem?.offline) URL.revokeObjectURL(playableItem.streamUrl);
  }

  function openPlayback(item: PlayableItem, position = 0) {
    const source = sources.find((entry) => entry.id === item.playlistId);
    if (source?.type === "STALKER" && isStalkerLink(item.streamUrl)) {
      // A portal hands out the stream address when you press play, and it only works for a short while.
      resolveStalkerLink(source, item.streamUrl)
        .then((streamUrl) => start({
          ...item,
          streamUrl,
          sourceUrl: item.streamUrl,
          userAgent: stalkerUserAgent(source),
          direct: isStalkerVideoLink(item.streamUrl) && !/[.](?:m3u8|mpd)(?:[?#]|$)/i.test(streamUrl),
        }, position))
        .catch((cause: unknown) => notify(cause instanceof Error ? cause.message : t("play.portalFailed"), "error"));
      return;
    }
    if (source?.type === "STALKER") {
      // Every stream of a portal goes through the desktop proxy: it sets the set-top-box User-Agent and needs no CORS.
      const plainFile = !item.live && !/[.](?:m3u8|mpd)(?:[?#]|$)/i.test(item.streamUrl);
      // A stored address on the portal's own host is played as it is, after making sure the box is logged in.
      void warmStalkerSession(source)
        .catch(() => undefined)
        .then(() => start({ ...item, userAgent: stalkerUserAgent(source), direct: item.direct ?? plainFile }, position));
      return;
    }
    start(item, position);
  }

  function start(item: PlayableItem, position: number) {
    revokeOfflineUrl();
    setResumePosition(position);
    setInlineLivePlayback(item.live);
    const source = sources.find((entry) => entry.id === item.playlistId);
    setPlayableItem({
      ...item,
      drmCertificateUrl: item.drmCertificateUrl || source?.drmCertificateUrl,
      userAgent: item.userAgent || source?.userAgent,
    });
  }

  /** Plays a recorded programme (or the one on air from its start) of a channel with an archive. */
  function openReplay(channel: LiveChannel, program: EpgProgram) {
    const source = sources.find((entry) => entry.id === channel.playlistId);
    const streamUrl = source && replayUrl(channel, source, program.startMillis, program.endMillis);
    if (!streamUrl) {
      notify(t("play.recordingFailed"), "error");
      return;
    }
    openPlayback({
      id: `${channel.id}:replay:${program.startMillis}`,
      playlistId: channel.playlistId,
      contentType: "LIVE",
      title: `${channel.name} · ${program.title}`,
      streamUrl,
      artworkUrl: channel.logoUrl,
      drmLicenseUrl: channel.drmLicenseUrl,
      drmSystem: channel.drmSystem,
      live: false,
      replay: true,
    });
  }

  /** Hands the stream to VLC or mpv. A portal address only lives a few seconds, so a fresh one is asked for first. */
  async function openExternal(item: PlayableItem) {
    const source = sources.find((entry) => entry.id === item.playlistId);
    try {
      const address = source?.type === "STALKER" && item.sourceUrl
        ? await resolveStalkerLink(source, item.sourceUrl)
        : item.streamUrl;
      const userAgent = source?.type === "STALKER" ? stalkerUserAgent(source) : source?.userAgent;
      closePlayback(); // the portal allows few connections at once, so the built-in player lets go first
      const player = await openInExternalPlayer(address, userAgent);
      notify(t("play.openedIn", { player }), "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "error");
    }
  }

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
        streamUrl: item.sourceUrl ?? item.streamUrl,
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
      notify(cause instanceof Error ? cause.message : t("play.recentFailed", { title: item.title }), "error");
    }
  }

  return {
    playableItem,
    inlineLivePlayback,
    resumePosition,
    openPlayback,
    openReplay,
    openExternal: canOpenExternally() ? openExternal : undefined,
    closePlayback,
    recordWatchedChannel,
  };
}
