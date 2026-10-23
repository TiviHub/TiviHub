import { useState } from "react";
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
        added ? `Added ${item.name} to favorites.` : `Removed ${item.name} from favorites.`,
        "notice",
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update favorites.", "error");
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
      notify(`Added ${item.name} to your watchlist.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not add this title to your library.", "error");
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
      streamUrl: item.streamUrl,
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
      notify(`${item.title} marked as ${status.toLowerCase()}.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update library status.", "error");
    }
  }

  async function deleteLibraryItem(id: string, title: string) {
    try {
      await removeLibraryItem(id);
      setLibrary(await getLibraryItems());
      notify(`Removed ${title} from your library.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not remove this library item.", "error");
    }
  }

  async function removeFromLibrary(item: Movie | Series, contentType: "MOVIE" | "SERIES") {
    await deleteLibraryItem(`${item.playlistId}:${contentType}:${item.id}`, item.name);
  }

  async function removeFavorite(favorite: Favorite) {
    try {
      await toggleStoredFavorite(favorite);
      setFavorites(await getFavorites());
      notify(`Removed ${favorite.title} from favorites.`, "notice");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not remove this favorite.", "error");
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
