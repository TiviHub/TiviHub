import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createSnapshot,
  deletePlaylist,
  getChannels,
  getEpgPrograms,
  getEpisodes,
  getFavorites,
  getMovies,
  getPlaylists,
  saveCatalog,
  saveEpisodes,
  savePlaylist,
  replaceEpg,
  replaceEpgForChannels,
  restoreSnapshot,
  toggleFavorite,
} from "../storage/database";
import type { Episode, EpgProgram, Favorite, LiveChannel, Playlist, Series } from "../types";

function playlist(id: string): Playlist {
  return {
    id,
    name: id,
    type: "XTREAM",
    url: "https://provider.example",
    username: `user-${id}`,
    password: `secret-${id}`,
    active: true,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: Date.now(),
  };
}

describe("local IndexedDB storage", () => {
  it("encrypts credentials at rest and returns them to the owner", async () => {
    const source = playlist("storage-test-credentials");
    await savePlaylist(source);
    const [stored] = await getPlaylists();
    expect(stored).toMatchObject({ id: source.id, username: source.username, password: source.password });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tivihub-web");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rawRecord = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = database.transaction("playlists").objectStore("playlists").get(source.id);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    expect(rawRecord).not.toHaveProperty("url");
    expect(rawRecord).not.toHaveProperty("username");
    expect(rawRecord).not.toHaveProperty("password");
    expect(rawRecord).toHaveProperty("privateData");
  });

  it("keeps episode replacement scoped to the matching source and series", async () => {
    const one = playlist("storage-test-episode-one");
    const two = playlist("storage-test-episode-two");
    await savePlaylist(one);
    await savePlaylist(two);
    const makeEpisode = (id: string, owner: Playlist, seriesId: string): Episode => ({
      id,
      playlistId: owner.id,
      seriesId,
      season: 1,
      number: 1,
      name: id,
      streamUrl: "https://provider.example/episode.m3u8",
    });
    const first = makeEpisode("episode-one", one, "shared-series-id");
    const second = makeEpisode("episode-two", two, "shared-series-id");
    await saveEpisodes(one.id, first.seriesId, [first]);
    await saveEpisodes(two.id, second.seriesId, [second]);
    await saveEpisodes(one.id, first.seriesId, [{ ...first, name: "Updated" }]);
    await expect(getEpisodes(one.id, first.seriesId)).resolves.toMatchObject([{ name: "Updated" }]);
    await expect(getEpisodes(two.id, second.seriesId)).resolves.toEqual([second]);
  });

  it("replaces catalog and episode records together without removing another source's episodes", async () => {
    const firstSeries: Series = {
      id: "storage-test-catalog-series-one",
      playlistId: "storage-test-catalog-one",
      name: "Series One",
      seasons: 1,
    };
    const firstEpisode: Episode = {
      id: "storage-test-catalog-episode-one",
      playlistId: firstSeries.playlistId,
      seriesId: "shared-series-id",
      season: 1,
      number: 1,
      name: "Original",
      streamUrl: "https://provider.example/one.m3u8",
    };
    const otherEpisode: Episode = {
      ...firstEpisode,
      id: "storage-test-catalog-episode-two",
      playlistId: "storage-test-catalog-two",
      name: "Other source",
    };
    const updatedEpisode: Episode = {
      ...firstEpisode,
      id: "storage-test-catalog-episode-updated",
      name: "Updated",
    };
    const emptyCatalog = {
      channels: [],
      movies: [],
      series: [],
      episodes: [],
    };

    await saveCatalog({
      playlistId: firstSeries.playlistId,
      ...emptyCatalog,
      series: [firstSeries],
      episodes: [firstEpisode],
    });
    await saveCatalog({
      playlistId: otherEpisode.playlistId,
      ...emptyCatalog,
      episodes: [otherEpisode],
    });
    await saveCatalog({
      playlistId: firstSeries.playlistId,
      ...emptyCatalog,
      series: [firstSeries],
      episodes: [updatedEpisode],
    });

    await expect(getEpisodes(firstSeries.playlistId, firstEpisode.seriesId)).resolves.toEqual([updatedEpisode]);
    await expect(getEpisodes(otherEpisode.playlistId, otherEpisode.seriesId)).resolves.toEqual([otherEpisode]);
  });

  it("preserves cached episodes and saves refresh metadata with an Xtream catalog", async () => {
    const source = playlist("storage-test-xtream-refresh");
    const series: Series = {
      id: `${source.id}:series:1`,
      playlistId: source.id,
      providerId: "1",
      name: "Series",
      seasons: 1,
    };
    const episode: Episode = {
      id: `${series.id}:episode:1`,
      playlistId: source.id,
      seriesId: series.id,
      season: 1,
      number: 1,
      name: "Episode",
      streamUrl: "https://provider.example/episode.m3u8",
    };
    await savePlaylist(source);
    await saveCatalog({
      playlistId: source.id,
      channels: [],
      movies: [],
      series: [series],
      episodes: [episode],
    });

    const refreshedSource: Playlist = {
      ...source,
      lastCatalogRefreshAt: 10_000,
      lastCatalogRefreshAttemptAt: 10_000,
      lastCatalogRefreshOutcome: "success",
      lastCatalogRefreshSummary: {
        channels: { added: 0, removed: 0 },
        movies: { added: 0, removed: 0 },
        series: { added: 1, removed: 0 },
      },
    };
    await saveCatalog({
      playlistId: source.id,
      channels: [],
      movies: [],
      series: [series],
      sourceUpdate: refreshedSource,
    });

    await expect(getEpisodes(source.id, series.id)).resolves.toEqual([episode]);
    const savedSource = (await getPlaylists()).find((entry) => entry.id === source.id);
    expect(savedSource).toMatchObject(refreshedSource);
  });

  it("keeps the last good catalog and metadata when a replacement transaction fails", async () => {
    const source = playlist("storage-test-failed-refresh");
    const previousChannel: LiveChannel = {
      id: `${source.id}:channel:old`,
      playlistId: source.id,
      name: "Saved channel",
      group: "News",
      streamUrl: "https://provider.example/old.m3u8",
    };
    await savePlaylist(source);
    await saveCatalog({
      playlistId: source.id,
      channels: [previousChannel],
      movies: [],
      series: [],
      episodes: [],
    });

    const invalidChannel = {
      ...previousChannel,
      id: `${source.id}:channel:invalid`,
      name: () => "Not cloneable",
    } as unknown as LiveChannel;
    await expect(saveCatalog({
      playlistId: source.id,
      channels: [invalidChannel],
      movies: [],
      series: [],
      episodes: [],
      sourceUpdate: {
        ...source,
        lastCatalogRefreshAt: 20_000,
        lastCatalogRefreshOutcome: "success",
      },
    })).rejects.toThrow();

    await expect(getChannels(source.id)).resolves.toEqual([previousChannel]);
    const savedSource = (await getPlaylists()).find((entry) => entry.id === source.id);
    expect(savedSource?.lastCatalogRefreshAt).toBeUndefined();
  });

  it("reports bounded progress as catalog records are written", async () => {
    const playlistId = "storage-test-batched-catalog";
    const channels = Array.from({ length: 1005 }, (_, index) => ({
      id: `${playlistId}:channel:${index}`,
      playlistId,
      name: `Channel ${index}`,
      group: "News",
      streamUrl: `https://provider.example/${index}.m3u8`,
    }));
    const progress: Array<[number, number]> = [];

    await saveCatalog({
      playlistId,
      channels,
      movies: [],
      series: [],
      episodes: [],
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress).toEqual([[1000, 1005], [1005, 1005]]);
    await expect(getChannels(playlistId)).resolves.toHaveLength(1005);
  });

  it("replaces guide data only for the selected source and channels", async () => {
    const one = playlist("storage-test-epg-one");
    const two = playlist("storage-test-epg-two");
    await savePlaylist(one);
    await savePlaylist(two);
    const makeProgram = (source: Playlist, channelId: string, title: string): EpgProgram => ({
      id: `${source.id}:${channelId}:${title}`,
      source: source.id,
      channelId,
      title,
      startMillis: Date.now(),
      endMillis: Date.now() + 60_000,
    });
    const original = makeProgram(one, "news.one", "Original");
    const unchanged = makeProgram(one, "news.two", "Unchanged");
    const otherSource = makeProgram(two, "news.one", "Other source");
    await replaceEpgForChannels(one.id, ["news.one", "news.two"], [original, unchanged]);
    await replaceEpgForChannels(two.id, ["news.one"], [otherSource]);
    const updated = makeProgram(one, "news.one", "Updated");
    await replaceEpgForChannels(one.id, ["news.one"], [updated]);

    const programs = (await getEpgPrograms()).filter((program) =>
      [one.id, two.id].includes(program.source),
    );
    expect(programs).toContainEqual(updated);
    expect(programs).toContainEqual(unchanged);
    expect(programs).toContainEqual(otherSource);
    expect(programs).not.toContainEqual(original);
  });

  it("deletes source-owned catalog and favorite data", async () => {
    const source = playlist("storage-test-cascade");
    await savePlaylist(source);
    const channel = {
      id: `${source.id}:channel`,
      playlistId: source.id,
      name: "Channel",
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
    };
    await saveCatalog({
      playlistId: source.id,
      channels: [channel],
      movies: [],
      series: [],
      episodes: [],
    });
    const favorite: Favorite = {
      id: `${source.id}:favorite`,
      contentId: channel.id,
      contentType: "LIVE",
      title: channel.name,
      playlistId: source.id,
      streamUrl: channel.streamUrl,
      addedAt: Date.now(),
    };
    await toggleFavorite(favorite);
    await deletePlaylist(source.id);
    await expect(getChannels(source.id)).resolves.toEqual([]);
    await expect(getFavorites()).resolves.not.toContainEqual(favorite);
    await expect(getPlaylists()).resolves.not.toContainEqual(expect.objectContaining({ id: source.id }));
  });

  it("reports bounded progress while deleting a large source and preserves other-source guide data", async () => {
    const source = playlist("storage-test-progress-delete");
    const otherSource = playlist("storage-test-progress-delete-other");
    const channels: LiveChannel[] = Array.from({ length: 1_050 }, (_, index) => ({
      id: `${source.id}:channel:${index}`,
      playlistId: source.id,
      name: `Channel ${index}`,
      group: "News",
      streamUrl: `https://provider.example/live/${index}.m3u8`,
    }));
    const movies = Array.from({ length: 1_050 }, (_, index) => ({
      id: `${source.id}:movie:${index}`,
      playlistId: source.id,
      name: `Movie ${index}`,
      streamUrl: `https://provider.example/movie/${index}.mp4`,
    }));
    const guide: EpgProgram = {
      id: `${source.id}:guide`,
      channelId: channels[0].id,
      title: "Source guide",
      startMillis: Date.now(),
      endMillis: Date.now() + 60_000,
      source: source.id,
    };
    const otherGuide: EpgProgram = { ...guide, id: `${otherSource.id}:guide`, source: otherSource.id };
    await savePlaylist(source);
    await savePlaylist(otherSource);
    await saveCatalog({
      playlistId: source.id,
      channels,
      movies,
      series: [],
      episodes: [],
    });
    await replaceEpg(source.id, [guide]);
    await replaceEpg(otherSource.id, [otherGuide]);
    const progress: Array<[number, number]> = [];

    await deletePlaylist(source.id, (completed, total) => progress.push([completed, total]));

    expect(progress.length).toBeGreaterThan(2);
    expect(progress.every(([completed, total], index) =>
      completed <= total && (index === 0 || completed > progress[index - 1][0]),
    )).toBe(true);
    expect(progress.every(([completed], index) =>
      index === 0 || completed - progress[index - 1][0] <= 10_000,
    )).toBe(true);
    expect(progress.at(-1)).toEqual([2_102, 2_102]);
    await expect(getChannels(source.id)).resolves.toEqual([]);
    await expect(getMovies(source.id)).resolves.toEqual([]);
    await expect(getEpgPrograms()).resolves.toContainEqual(otherGuide);
    await expect(getPlaylists()).resolves.not.toContainEqual(expect.objectContaining({ id: source.id }));
  }, 30_000);

  it("restores snapshots with credentials encrypted again in local storage", async () => {
    const source = playlist("storage-test-restore");
    await savePlaylist(source);
    const snapshot = await createSnapshot("light", true);
    expect(snapshot.showAdultContent).toBe(true);
    await restoreSnapshot(snapshot);
    await expect(getPlaylists()).resolves.toContainEqual(expect.objectContaining({
      id: source.id,
      username: source.username,
      password: source.password,
    }));
  });
});
