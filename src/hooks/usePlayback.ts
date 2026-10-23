import { useState, type Dispatch, type SetStateAction } from "react";
import { replayUrl } from "../catchup";
import { isStalkerLink, isStalkerVideoLink, resolveStalkerLink, stalkerUserAgent } from "../providers/stalker";
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
  const [streamHealthRequest, setStreamHealthRequest] = useState<{
    channels: LiveChannel[];
    groupName: string;
  } | null>(null);

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
        .catch((cause: unknown) => notify(cause instanceof Error ? cause.message : "The portal could not start this stream.", "error"));
      return;
    }
    if (source?.type === "STALKER") {
      // Every stream of a portal goes through the desktop proxy: it sets the set-top-box User-Agent and needs no CORS.
      const plainFile = !item.live && !/[.](?:m3u8|mpd)(?:[?#]|$)/i.test(item.streamUrl);
      start({ ...item, userAgent: stalkerUserAgent(source), direct: item.direct ?? plainFile }, position);
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
      notify("This recording could not be opened. The provider may not keep it any more.", "error");
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
      notify(cause instanceof Error ? cause.message : `Could not save ${item.title} to recently watched channels.`, "error");
    }
  }

  return {
    playableItem,
    inlineLivePlayback,
    resumePosition,
    streamHealthRequest,
    setStreamHealthRequest,
    openPlayback,
    openReplay,
    closePlayback,
    recordWatchedChannel,
  };
}
