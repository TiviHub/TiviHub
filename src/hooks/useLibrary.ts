import { useState } from "react";
import { t } from "../lib/i18n";
import {
  getFavorites,
  getLibraryItems,
  removeLibraryItem,
  saveLibraryItem,
  toggleFavorite as toggleStoredFavorite,
} from "../storage/database";
import type {
  Favorite,
  LibraryItem,
  LibraryStatus,
  LiveChannel,
  Movie,
  PlayableItem,
  Series,
} from "../types";

export function useLibrary(notify: (message: string, kind: "error" | "notice") => void) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);

  async function toggleFavorite(
    item: LiveChannel | Movie | Series,
    contentType: "LIVE" | "MOVIE" | "SERIES",
  ) {
    const favorite: Favorite = {
      id: `${item.playlistId}:${contentType}:${item.id}`,
      contentId: item.id,
      contentType,
      title: item.name,
      playlistId: item.playlistId,
      streamUrl: "streamUrl" in item ? item.streamUrl : undefined,
      artworkUrl: "group" in item ? item.logoUrl : item.posterUrl,
      drmLicenseUrl: "drmLicenseUrl" in item ? item.drmLicenseUrl : undefined,
      drmSystem: "drmSystem" in item ? item.drmSystem : undefined,
      addedAt: Date.now(),
    };
    try {
      const added = await toggleStoredFavorite(favorite);
      setFavorites(await getFavorites());
      notify(
        added ? t("library.favAdded", { name: item.name }) : t("library.favRemoved", { name: item.name }),
        "notice",
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("library.favFailed"), "error");
    }
  }

  async function addToWatchlist(item: Movie | Series, contentType: "MOVIE" | "SERIES") {
    const id = `${item.playlistId}:${contentType}:${item.id}`;
    if (library.some((entry) => entry.id === id)) return;
    try {
      await saveLibraryItem({
        id,
        contentId: item.id,
        contentType,
        playlistId: item.playlistId,
        title: item.name,
        streamUrl: "streamUrl" in item ? item.streamUrl : undefined,
        artworkUrl: item.posterUrl,
        status: "WATCHLIST",
        positionMillis: 0,
        durationMillis: 0,
        updatedAt: Date.now(),
      });
      setLibrary(await getLibraryItems());
      notify(t("library.watchlistAdded", { name: item.name }), "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("library.addFailed"), "error");
    }
  }

  async function saveProgress(
    item: PlayableItem,
    positionMillis: number,
    durationMillis: number,
    watched = false,
  ) {
    const id = `${item.playlistId}:${item.contentType}:${item.id}`;
    await saveLibraryItem({
      id,
      contentId: item.id,
      contentType: item.contentType,
      playlistId: item.playlistId,
      title: item.title,
      streamUrl: item.sourceUrl ?? item.streamUrl,
      artworkUrl: item.artworkUrl,
      drmLicenseUrl: item.drmLicenseUrl,
      drmSystem: item.drmSystem,
      status: watched ? "WATCHED" : "WATCHING",
      positionMillis: watched && durationMillis > 0 ? durationMillis : positionMillis,
      durationMillis,
      parentId: item.parentId,
      parentTitle: item.parentTitle,
      updatedAt: Date.now(),
    });
    setLibrary(await getLibraryItems());
  }

  async function changeLibraryStatus(item: LibraryItem, status: LibraryStatus) {
    try {
      await saveLibraryItem({
        ...item,
        status,
        positionMillis: status === "WATCHED" ? item.durationMillis : item.positionMillis,
        updatedAt: Date.now(),
      });
      setLibrary(await getLibraryItems());
      notify(t(status === "WATCHLIST" ? "library.markedWatchlist" : status === "WATCHING" ? "library.markedWatching" : "library.markedWatched", { title: item.title }), "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("library.statusFailed"), "error");
    }
  }

  async function deleteLibraryItem(id: string, title: string) {
    try {
      await removeLibraryItem(id);
      setLibrary(await getLibraryItems());
      notify(t("library.removed", { title }), "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("library.removeFailed"), "error");
    }
  }

  async function removeFromLibrary(item: Movie | Series, contentType: "MOVIE" | "SERIES") {
    await deleteLibraryItem(`${item.playlistId}:${contentType}:${item.id}`, item.name);
  }

  async function removeFavorite(favorite: Favorite) {
    try {
      await toggleStoredFavorite(favorite);
      setFavorites(await getFavorites());
      notify(t("library.favRemoved", { name: favorite.title }), "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("library.favoriteRemoveFailed"), "error");
    }
  }

  return {
    favorites,
    library,
    setFavorites,
    setLibrary,
    toggleFavorite,
    addToWatchlist,
    saveProgress,
    changeLibraryStatus,
    deleteLibraryItem,
    removeFromLibrary,
    removeFavorite,
  };
}
