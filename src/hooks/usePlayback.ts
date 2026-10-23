import { useState, type Dispatch, type SetStateAction } from "react";
import { getLibraryItems, saveLibraryItem } from "../storage/database";
import type { LibraryItem, LiveChannel, PlayableItem, Playlist } from "../types";

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
    revokeOfflineUrl();
    setResumePosition(position);
    setInlineLivePlayback(item.live);
    const source = sources.find((entry) => entry.id === item.playlistId);
    setPlayableItem({
      ...item,
      drmCertificateUrl: item.drmCertificateUrl || source?.drmCertificateUrl,
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

  return {
    playableItem,
    inlineLivePlayback,
    resumePosition,
    streamHealthRequest,
    setStreamHealthRequest,
    openPlayback,
    closePlayback,
    recordWatchedChannel,
  };
}
