// Imports a generated catalog into the perf build through the app's own UI, then saves the
// resulting data folders so measurement runs can restore a copy instead of importing again.
// Usage: node scripts/perf/seed.mjs --size M
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SIZES } from "./dataset.mjs";
import { launchApp, waitForReady } from "./launch.mjs";
import { MOCK_PASSWORD, MOCK_USERNAME, startMockXtream } from "./mockXtream.mjs";
import { resetProfile, saveProfile } from "./profile.mjs";

export async function addMockSource(page, mockUrl) {
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByRole("button", { name: /^Add (?:another )?source$/ }).click();
  await page.getByRole("button", { name: "Xtream account" }).click();
  await page.getByLabel(/Playlist name/).fill("Perf source");
  await page.getByLabel(/Provider server URL/).fill(mockUrl);
  await page.getByLabel(/Username/).fill(MOCK_USERNAME);
  await page.getByLabel(/Password/).fill(MOCK_PASSWORD);
  const clickedAt = performance.now();
  await page.getByRole("button", { name: "Connect source" }).click();
  return clickedAt;
}

/** Waits until the add-source dialog is gone, i.e. the import finished and was saved. */
export async function waitForImport(page, timeoutMs = 30 * 60_000) {
  // The button's text changes while connecting, so wait for the whole form to go away instead.
  await page.locator("form.dialog-form").waitFor({ state: "detached", timeout: timeoutMs });
}

export async function seed(size) {
  const counts = SIZES[size];
  if (!counts) throw new Error(`Unknown size ${size}`);
  resetProfile();
  const mock = await startMockXtream({ size });
  const app = await launchApp();
  try {
    await waitForReady(app.page, app.startedAt);
    const clickedAt = await addMockSource(app.page, mock.url);
    await waitForImport(app.page);
    const importMs = performance.now() - clickedAt;
    await app.page.getByRole("button", { name: "Movies" }).first().click();
    const summary = await app.page.getByText(/^Showing .* of /).first().innerText({ timeout: 60_000 });
    const total = Number(summary.split(" of ")[1].replace(/[^\d]/g, ""));
    if (total !== counts.movies) throw new Error(`Expected ${counts.movies} movies but the app shows ${total}.`);
    return { size, importMs: Math.round(importMs), movies: total };
  } finally {
    await app.stop();
    await mock.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--size");
  const size = index >= 0 ? process.argv[index + 1] : "S";
  const result = await seed(size);
  saveProfile(size);
  console.log(JSON.stringify(result));
}
