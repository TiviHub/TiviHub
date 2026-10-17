import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createSnapshot,
  deletePlaylist,
  getChannels,
  getEpgPrograms,
  getEpisodes,
  getFavorites,
  getPlaylists,
  saveCatalog,
  saveEpisodes,
  savePlaylist,
  replaceEpgForChannels,
  restoreSnapshot,
  toggleFavorite,
} from "../storage/database";
import type { Episode, EpgProgram, Favorite, Playlist } from "../types";

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
