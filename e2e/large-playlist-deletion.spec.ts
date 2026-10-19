import { expect, test } from "@playwright/test";

test("deletes an Xtream-sized catalog from IndexedDB with visible progress", async ({ page }) => {
  await page.goto("/app.html");
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByRole("button", { name: "Import demo" }).click();
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await expect(page.getByRole("button", { name: "Delete TiviHub Demo Library" })).toBeVisible();

  const recordCount = await page.evaluate(async () => {
    const [{ saveCatalog }, { DEMO_PLAYLIST_ID }] = await Promise.all([
      import("/src/storage/database.ts"),
      import("/src/demo.ts"),
    ]);
    const channels = Array.from({ length: 55_680 }, (_, index) => ({
      id: `${DEMO_PLAYLIST_ID}:e2e-channel:${index}`,
      playlistId: DEMO_PLAYLIST_ID,
      providerId: String(index + 1),
      name: `Channel ${index}`,
      group: "Live",
      streamUrl: `https://provider.example/live/${index}.m3u8`,
    }));
    const movies = Array.from({ length: 214_204 }, (_, index) => ({
      id: `${DEMO_PLAYLIST_ID}:e2e-movie:${index}`,
      playlistId: DEMO_PLAYLIST_ID,
      providerId: String(index + 1),
      name: `Movie ${index}`,
      streamUrl: `https://provider.example/movie/${index}.mp4`,
    }));
    const series = Array.from({ length: 46_153 }, (_, index) => ({
      id: `${DEMO_PLAYLIST_ID}:e2e-series:${index}`,
      playlistId: DEMO_PLAYLIST_ID,
      providerId: String(index + 1),
      name: `Series ${index}`,
      category: "Series",
      seasons: 1,
    }));
    await saveCatalog({
      playlistId: DEMO_PLAYLIST_ID,
      channels,
      movies,
      series,
      episodes: [],
    });
    return channels.length + movies.length + series.length + 1;
  });

  expect(recordCount).toBe(316_038);
  page.on("dialog", (dialog) => dialog.accept());
  const deletionStartedAt = Date.now();
  await page.getByRole("button", { name: "Delete TiviHub Demo Library" }).click();

  await expect(page.getByRole("dialog", { name: "Preparing playlist deletion" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Deleting playlist" })).toBeVisible();
  const progress = page.getByRole("progressbar", { name: "Playlist deletion progress" });
  await expect(progress).toHaveAttribute("aria-valuemax", String(recordCount + 1));
  await expect(page.getByText(/records deleted/)).toBeVisible();
  await expect(page.getByText(/and its local data were deleted/)).toBeVisible({ timeout: 180_000 });
  console.log(`Deleted ${recordCount + 1} IndexedDB records and reloaded the library in ${Date.now() - deletionStartedAt} ms`);

  const remainingRecords = await page.evaluate(async () => {
    const { DEMO_PLAYLIST_ID } = await import("/src/demo.ts");
    const { getCatalogSnapshot, getPlaylists } = await import("/src/storage/database.ts");
    const [playlists, catalog] = await Promise.all([
      getPlaylists(),
      getCatalogSnapshot(DEMO_PLAYLIST_ID),
    ]);
    return {
      playlistExists: playlists.some((playlist) => playlist.id === DEMO_PLAYLIST_ID),
      channels: catalog.channels.length,
      movies: catalog.movies.length,
      series: catalog.series.length,
      episodes: catalog.episodes.length,
    };
  });
  expect(remainingRecords).toEqual({
    playlistExists: false,
    channels: 0,
    movies: 0,
    series: 0,
    episodes: 0,
  });
});
