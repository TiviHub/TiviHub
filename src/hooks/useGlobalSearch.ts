import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { GlobalSearchCommand, GlobalSearchMatch, SearchSection } from "../globalSearch";
import type { Episode, Movie, PlayableItem, Series } from "../types";
import { visibleButton } from "../visibleButton";

type Setter<T> = Dispatch<SetStateAction<T>>;

interface Options {
  canOpen: boolean;
  openAddSource: () => void;
  openPlayback: (item: PlayableItem) => void;
  openSeries: (item: Series) => Promise<void>;
  refreshCurrentSource: () => Promise<void>;
  setEpisodeError: Setter<string | null>;
  setEpisodes: Setter<Episode[]>;
  setSection: Setter<SearchSection>;
  setSelectedMovie: Setter<Movie | null>;
  setSelectedSeries: Setter<Series | null>;
}

export function useGlobalSearch({
  canOpen,
  openAddSource,
  openPlayback,
  openSeries,
  refreshCurrentSource,
  setEpisodeError,
  setEpisodes,
  setSection,
  setSelectedMovie,
  setSelectedSeries,
}: Options) {
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!globalSearchOpen) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [globalSearchOpen]);

  useEffect(() => {
    if (globalSearchOpen) return;
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    if (returnFocus?.isConnected) returnFocus.focus();
  }, [globalSearchOpen]);

  function openGlobalSearch() {
    if (!canOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : visibleButton(".global-search-button");
    setGlobalSearchOpen(true);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "k" || event.repeat) return;
      if (!canOpen || globalSearchOpen) return;
      event.preventDefault();
      openGlobalSearch();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openGlobalSearch only reads canOpen
  }, [canOpen, globalSearchOpen]);

  function closeGlobalSearch(restoreFocus = true) {
    if (!restoreFocus) returnFocusRef.current = null;
    setGlobalSearchOpen(false);
  }

  function runGlobalSearchCommand(command: GlobalSearchCommand) {
    closeGlobalSearch(false);
    if (command.kind === "navigate") {
      setSelectedMovie(null);
      setSelectedSeries(null);
      setEpisodes([]);
      setEpisodeError(null);
      setSection(command.section);
    } else if (command.kind === "add-source") {
      openAddSource();
    } else {
      void refreshCurrentSource();
    }
  }

  function openGlobalSearchResult(result: GlobalSearchMatch) {
    closeGlobalSearch(false);
    if (result.type === "LIVE") {
      const channel = result.item;
      setSelectedMovie(null);
      setSelectedSeries(null);
      setEpisodes([]);
      setSection("Live TV");
      openPlayback({
        id: channel.id,
        playlistId: channel.playlistId,
        contentType: "LIVE",
        title: channel.name,
        streamUrl: channel.streamUrl,
        artworkUrl: channel.logoUrl,
        drmLicenseUrl: channel.drmLicenseUrl,
        drmSystem: channel.drmSystem,
        live: true,
      });
    } else if (result.type === "MOVIE") {
      setSelectedMovie(result.item);
      setSelectedSeries(null);
      setSection("Movies");
    } else {
      void openSeries(result.item);
    }
  }

  return { globalSearchOpen, openGlobalSearch, closeGlobalSearch, runGlobalSearchCommand, openGlobalSearchResult };
}
