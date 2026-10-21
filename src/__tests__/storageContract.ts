import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DatabaseModule from "../storage/database";
import type { Episode, EpgProgram, Favorite, LiveChannel, Playlist, Series } from "../types";

type Database = typeof DatabaseModule;

export type StorageContractTarget = {
  database: Database;
  /** The playlist record exactly as the backend stores it. */
  rawPlaylist: (id: string) => Promise<Record<string, unknown>>;
  /** IndexedDB reports delete progress in chunks; the Rust store deletes in one transaction. */
  incrementalDeleteProgress: boolean;
  close?: () => void;
};

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

export function describeStorageContract(name: string, open: () => Promise<StorageContractTarget>) {
describe(name, () => {
  let target: StorageContractTarget;
  let db: Database;
  beforeAll(async () => {
    target = await open();
    db = target.database;
  }, 120_000);
  afterAll(() => target?.close?.());

  it("encrypts credentials at rest and returns them to the owner", async () => {
    const source = playlist("storage-test-credentials");
    await db.savePlaylist(source);
    const [stored] = await db.getPlaylists();
    expect(stored).toMatchObject({ id: source.id, username: source.username, password: source.password });
    const rawRecord = await target.rawPlaylist(source.id);
    expect(rawRecord).not.toHaveProperty("url");
    expect(rawRecord).not.toHaveProperty("username");
    expect(rawRecord).not.toHaveProperty("password");
    expect(rawRecord).toHaveProperty("privateData");
  });

  it("keeps episode replacement scoped to the matching source and series", async () => {
    const one = playlist("storage-test-episode-one");
    const two = playlist("storage-test-episode-two");
    await db.savePlaylist(one);
    await db.savePlaylist(two);
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
    await db.saveEpisodes(one.id, first.seriesId, [first]);
    await db.saveEpisodes(two.id, second.seriesId, [second]);
    await db.saveEpisodes(one.id, first.seriesId, [{ ...first, name: "Updated" }]);
    await expect(db.getEpisodes(one.id, first.seriesId)).resolves.toMatchObject([{ name: "Updated" }]);
    await expect(db.getEpisodes(two.id, second.seriesId)).resolves.toEqual([second]);
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

    await db.saveCatalog({
      playlistId: firstSeries.playlistId,
      ...emptyCatalog,
      series: [firstSeries],
      episodes: [firstEpisode],
    });
    await db.saveCatalog({
      playlistId: otherEpisode.playlistId,
      ...emptyCatalog,
      episodes: [otherEpisode],
    });
    await db.saveCatalog({
      playlistId: firstSeries.playlistId,
      ...emptyCatalog,
      series: [firstSeries],
      episodes: [updatedEpisode],
    });

    await expect(db.getEpisodes(firstSeries.playlistId, firstEpisode.seriesId)).resolves.toEqual([updatedEpisode]);
    await expect(db.getEpisodes(otherEpisode.playlistId, otherEpisode.seriesId)).resolves.toEqual([otherEpisode]);
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
    await db.savePlaylist(source);
    await db.saveCatalog({
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
    await db.saveCatalog({
      playlistId: source.id,
      channels: [],
      movies: [],
      series: [series],
      sourceUpdate: refreshedSource,
    });

    await expect(db.getEpisodes(source.id, series.id)).resolves.toEqual([episode]);
    const savedSource = (await db.getPlaylists()).find((entry) => entry.id === source.id);
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
    await db.savePlaylist(source);
    await db.saveCatalog({
      playlistId: source.id,
      channels: [previousChannel],
      movies: [],
      series: [],
      episodes: [],
    });

    const invalidChannel = {
      ...previousChannel,
      id: undefined,
    } as unknown as LiveChannel;
    await expect(db.saveCatalog({
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

    await expect(db.getChannels(source.id)).resolves.toEqual([previousChannel]);
    const savedSource = (await db.getPlaylists()).find((entry) => entry.id === source.id);
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

    await db.saveCatalog({
      playlistId,
      channels,
      movies: [],
      series: [],
      episodes: [],
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress).toEqual([[1000, 1005], [1005, 1005]]);
    await expect(db.getChannels(playlistId)).resolves.toHaveLength(1005);
  });

  it("replaces guide data only for the selected source and channels", async () => {
    const one = playlist("storage-test-epg-one");
    const two = playlist("storage-test-epg-two");
    await db.savePlaylist(one);
    await db.savePlaylist(two);
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
    await db.replaceEpgForChannels(one.id, ["news.one", "news.two"], [original, unchanged]);
    await db.replaceEpgForChannels(two.id, ["news.one"], [otherSource]);
    const updated = makeProgram(one, "news.one", "Updated");
    await db.replaceEpgForChannels(one.id, ["news.one"], [updated]);

    const programs = (await db.getEpgPrograms()).filter((program) =>
      [one.id, two.id].includes(program.source),
    );
    expect(programs).toContainEqual(updated);
    expect(programs).toContainEqual(unchanged);
    expect(programs).toContainEqual(otherSource);
    expect(programs).not.toContainEqual(original);
  });

  it("deletes source-owned catalog and favorite data", async () => {
    const source = playlist("storage-test-cascade");
    await db.savePlaylist(source);
    const channel = {
      id: `${source.id}:channel`,
      playlistId: source.id,
      name: "Channel",
      group: "News",
      streamUrl: "https://provider.example/live.m3u8",
    };
    await db.saveCatalog({
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
    await db.toggleFavorite(favorite);
    await db.deletePlaylist(source.id);
    await expect(db.getChannels(source.id)).resolves.toEqual([]);
    await expect(db.getFavorites()).resolves.not.toContainEqual(favorite);
    await expect(db.getPlaylists()).resolves.not.toContainEqual(expect.objectContaining({ id: source.id }));
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
    await db.savePlaylist(source);
    await db.savePlaylist(otherSource);
    await db.saveCatalog({
      playlistId: source.id,
      channels,
      movies,
      series: [],
      episodes: [],
    });
    await db.replaceEpg(source.id, [guide]);
    await db.replaceEpg(otherSource.id, [otherGuide]);
    const progress: Array<[number, number]> = [];

    await db.deletePlaylist(source.id, (completed, total) => progress.push([completed, total]));

    expect(progress.length).toBeGreaterThanOrEqual(target.incrementalDeleteProgress ? 3 : 1);
    expect(progress.every(([completed, total], index) =>
      completed <= total && (index === 0 || completed > progress[index - 1][0]),
    )).toBe(true);
    expect(progress.every(([completed], index) =>
      index === 0 || completed - progress[index - 1][0] <= 10_000,
    )).toBe(true);
    expect(progress.at(-1)).toEqual([2_102, 2_102]);
    await expect(db.getChannels(source.id)).resolves.toEqual([]);
    await expect(db.getMovies(source.id)).resolves.toEqual([]);
    await expect(db.getEpgPrograms()).resolves.toContainEqual(otherGuide);
    await expect(db.getPlaylists()).resolves.not.toContainEqual(expect.objectContaining({ id: source.id }));
  }, 30_000);

  it("restores snapshots with credentials encrypted again in local storage", async () => {
    const source = playlist("storage-test-restore");
    await db.savePlaylist(source);
    const snapshot = await db.createSnapshot("light", true);
    expect(snapshot.showAdultContent).toBe(true);
    await db.restoreSnapshot(snapshot);
    await expect(db.getPlaylists()).resolves.toContainEqual(expect.objectContaining({
      id: source.id,
      username: source.username,
      password: source.password,
    }));
  });
});
}
