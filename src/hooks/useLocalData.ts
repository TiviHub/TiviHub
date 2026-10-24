import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  getChannels,
  getEpgPrograms,
  getFavorites,
  getLibraryItems,
  getMdblistApiKey,
  getMovies,
  getOpenSubtitlesApiKey,
  getPlaylists,
  getSeries,
  setActivePlaylist,
} from "../storage/database";
import type { EpgProgram, Favorite, LibraryItem, LiveChannel, Movie, Playlist, Series } from "../types";

interface Options {
  notify: (message: string, kind: "error" | "notice") => void;
  setFavorites: Dispatch<SetStateAction<Favorite[]>>;
  setLibrary: Dispatch<SetStateAction<LibraryItem[]>>;
}

const mergeById = <T extends { id: string }>(current: T[], added: T[]): T[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of added) byId.set(item.id, item);
  return [...byId.values()];
};

export function useLocalData({ notify, setFavorites, setLibrary }: Options) {
  const [sources, setSources] = useState<Playlist[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [subtitleApiKey, setSubtitleApiKey] = useState("");
  const [mdblistApiKey, setMdblistApiKey] = useState("");
  const [ready, setReady] = useState(false);

  /** Titles read from a provider while browsing join the ones in memory (they are already stored). */
  const addMovies = useCallback((added: Movie[]) => setMovies((current) => mergeById(current, added)), []);
  const addSeries = useCallback((added: Series[]) => setSeries((current) => mergeById(current, added)), []);

  async function reloadLocalData(preferredSourceId?: string) {
    const savedSources = await getPlaylists();
    const chosen = savedSources.find((source) => source.id === preferredSourceId) ??
      savedSources.find((source) => source.active) ??
      savedSources[0] ??
      null;
    if (chosen && !chosen.active) await setActivePlaylist(chosen.id);
    const activeSources = chosen
      ? savedSources.map((source) => ({ ...source, active: source.id === chosen.id }))
      : savedSources;
    const [savedFavorites, savedLibrary, allEpg, key, savedMdblistKey] = await Promise.all([
      getFavorites(),
      getLibraryItems(),
      getEpgPrograms(),
      getOpenSubtitlesApiKey(),
      getMdblistApiKey(),
    ]);
    setSources(activeSources);
    setActiveSourceId(chosen?.id ?? null);
    setFavorites(savedFavorites);
    setLibrary(savedLibrary);
    setEpg(chosen ? allEpg.filter((program) => program.source === chosen.id) : []);
    setSubtitleApiKey(key);
    setMdblistApiKey(savedMdblistKey);
    if (chosen) {
      const [savedChannels, savedMovies, savedSeries] = await Promise.all([
        getChannels(chosen.id),
        getMovies(chosen.id),
        getSeries(chosen.id),
      ]);
      setChannels(savedChannels);
      setMovies(savedMovies);
      setSeries(savedSeries);
    } else {
      setChannels([]);
      setMovies([]);
      setSeries([]);
    }
  }

  useEffect(() => {
    let active = true;
    void reloadLocalData().then(() => {
      if (active) setReady(true);
    }).catch((cause: unknown) => {
      if (active) {
        notify(cause instanceof Error ? cause.message : "Could not open local TiviHub data.", "error");
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  return {
    sources,
    activeSourceId,
    channels,
    movies,
    series,
    addMovies,
    addSeries,
    epg,
    setEpg,
    subtitleApiKey,
    setSubtitleApiKey,
    mdblistApiKey,
    setMdblistApiKey,
    ready,
    reloadLocalData,
  };
}
