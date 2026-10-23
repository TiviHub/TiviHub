import { useEffect, useMemo, useRef, useState } from "react";
import {
  canDownloadMedia,
  chooseDownloadDirectory,
  clearCompletedDownloads,
  downloadIdFor,
  downloadMedia,
  getDownloadedBlob,
  getDownloadDirectoryPath,
  getDownloads,
  removeDownload,
  removeOrphanedParts,
  type DownloadableMedia,
  type DownloadProgress,
  type DownloadRecord,
  type DownloadTask,
} from "../downloads";
import type { PlayableItem, Playlist } from "../types";

interface Options {
  notify: (message: string, kind: "error" | "notice") => void;
  openPlayback: (item: PlayableItem) => void;
  sources: Playlist[];
}

export function useDownloads({ notify, openPlayback, sources }: Options) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const [downloadDirectoryPath, setDownloadDirectoryPath] = useState<string | null>(null);
  const [downloadsLoaded, setDownloadsLoaded] = useState(false);
  const downloadControllers = useRef(new Map<string, AbortController>());

  const downloadedIds = useMemo(() => new Set(downloads.map((download) => download.id)), [downloads]);
  const activeDownloadIds = useMemo(
    () => new Set(downloadTasks.filter((task) => task.status === "downloading").map((task) => task.id)),
    [downloadTasks],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([removeOrphanedParts().then(getDownloads), getDownloadDirectoryPath()]).then(([savedDownloads, directoryPath]) => {
      if (!active) return;
      setDownloads(savedDownloads);
      setDownloadDirectoryPath(directoryPath);
      setDownloadsLoaded(true);
    }).catch((cause: unknown) => {
      if (active) {
        console.error("Could not load offline downloads", cause);
        notify(cause instanceof Error ? cause.message : "Could not load offline downloads.", "error");
        setDownloadsLoaded(true);
      }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on startup
  }, []);

  useEffect(() => () => {
    for (const controller of downloadControllers.current.values()) controller.abort();
    downloadControllers.current.clear();
  }, []);

  async function startDownload(media: DownloadableMedia) {
    if (!canDownloadMedia(media)) {
      notify("Offline downloads support direct, non-DRM movie and episode files only.", "error");
      return;
    }
    const id = downloadIdFor(media);
    if (downloadedIds.has(id)) return;
    if (downloadControllers.current.has(id)) return;

    const controller = new AbortController();
    downloadControllers.current.set(id, controller);
    setDownloadTasks((tasks) => [
      ...tasks.filter((task) => task.id !== id),
      { id, title: media.title, media, receivedBytes: 0, totalBytes: null, status: "downloading" },
    ]);
    try {
      const userAgent = sources.find((source) => source.id === media.playlistId)?.userAgent;
      const result = await downloadMedia(media, controller.signal, (progress: DownloadProgress) => {
        setDownloadTasks((tasks) => tasks.map((task) => task.id === progress.id
          ? { ...task, ...progress, status: "downloading", error: undefined }
          : task));
      }, userAgent);
      setDownloads((current) => [
        result.record,
        ...current.filter((download) => download.id !== result.record.id),
      ].sort((a, b) => b.completedAt - a.completedAt));
      setDownloadTasks((tasks) => tasks.filter((task) => task.id !== id));
      if (result.folderError) {
        console.error("Offline video was saved, but its folder copy failed", result.folderError);
        notify(result.folderError.message, "error");
      } else {
        notify(`${media.title} is ready for offline playback.`, "notice");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setDownloadTasks((tasks) => tasks.filter((task) => task.id !== id));
        return;
      }
      const message = cause instanceof Error ? cause.message : "Could not download this video.";
      console.error("Could not download offline media", cause);
      setDownloadTasks((tasks) => tasks.map((task) => task.id === id
        ? { ...task, status: "failed", error: message }
        : task));
      notify(message, "error");
    } finally {
      downloadControllers.current.delete(id);
    }
  }

  function cancelDownload(id: string) {
    downloadControllers.current.get(id)?.abort();
  }

  function removeFailedDownload(id: string) {
    setDownloadTasks((tasks) => tasks.filter((task) => task.id !== id || task.status !== "failed"));
  }

  async function deleteDownload(id: string, title: string) {
    try {
      await removeDownload(id);
      setDownloads((current) => current.filter((download) => download.id !== id));
      notify(`Removed ${title} from downloads.`, "notice");
    } catch (cause) {
      console.error("Could not remove downloaded media", cause);
      notify(cause instanceof Error ? cause.message : "Could not remove this download.", "error");
    }
  }

  async function clearDownloads() {
    if (!window.confirm("Delete all completed downloads from this device?")) return;
    try {
      await clearCompletedDownloads();
      setDownloads([]);
      notify("Completed downloads were removed.", "notice");
    } catch (cause) {
      console.error("Could not clear completed downloads", cause);
      notify(cause instanceof Error ? cause.message : "Could not clear completed downloads.", "error");
    }
  }

  async function changeDownloadDirectory() {
    try {
      const name = await chooseDownloadDirectory();
      setDownloadDirectoryPath(name);
      notify(`New downloads will also be copied to ${name}.`, "notice");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      console.error("Could not change the download folder", cause);
      notify(cause instanceof Error ? cause.message : "Could not change the download folder.", "error");
    }
  }

  async function playDownload(download: DownloadRecord) {
    try {
      const blob = await getDownloadedBlob(download.id);
      openPlayback({
        id: download.mediaId,
        playlistId: download.playlistId,
        contentType: download.contentType,
        title: download.title,
        streamUrl: URL.createObjectURL(blob),
        artworkUrl: download.artworkUrl,
        live: false,
        parentTitle: download.parentTitle,
        offline: true,
      });
    } catch (cause) {
      console.error("Could not open offline media", cause);
      notify(cause instanceof Error ? cause.message : "Could not open this offline video.", "error");
    }
  }

  return {
    downloads,
    downloadTasks,
    downloadDirectoryPath,
    downloadsLoaded,
    downloadedIds,
    activeDownloadIds,
    startDownload,
    cancelDownload,
    removeFailedDownload,
    deleteDownload,
    clearDownloads,
    changeDownloadDirectory,
    playDownload,
  };
}
