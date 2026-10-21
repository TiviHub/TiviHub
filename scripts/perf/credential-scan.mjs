// Adds sentinel credentials (Xtream login, M3U token), plays a stream that fails, exports the
// diagnostics, and then searches everything the app wrote for the sentinels.
// Usage: node scripts/perf/credential-scan.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { launchApp, perfDataDirs, waitForReady } from "./launch.mjs";
import { MOCK_PASSWORD, MOCK_PORT, MOCK_USERNAME, startMockXtream } from "./mockXtream.mjs";
import { resetProfile } from "./profile.mjs";
import { RESULTS_DIR, writeResult } from "./results.mjs";
import { addMockSource, waitForImport } from "./seed.mjs";

const TOKEN = "SENTINEL-TOKEN-7f2";
const NEEDLES = { username: MOCK_USERNAME, password: MOCK_PASSWORD, m3uToken: TOKEN };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Searches raw bytes as UTF-8 and UTF-16 (Chromium stores some strings as UTF-16). */
export function scanFiles(roots) {
  const hits = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      let data;
      try {
        data = readFileSync(file);
      } catch {
        continue; // locked file
      }
      for (const [label, needle] of Object.entries(NEEDLES)) {
        const found = data.includes(Buffer.from(needle, "utf8")) || data.includes(Buffer.from(needle, "utf16le"));
        if (found) hits.push({ label, file: relative(root, file).replaceAll("\\", "/"), root: root.includes("Roaming") ? "app data" : "webview" });
      }
    }
  }
  return hits;
}

async function main() {
  resetProfile();
  const mock = await startMockXtream({ size: "S", port: MOCK_PORT });
  const app = await launchApp();
  const where = {};
  try {
    const { page } = app;
    await waitForReady(page, app.startedAt);
    await addMockSource(page, mock.url);
    await waitForImport(page);
    // M3U source with a token in the URL
    await page.getByRole("button", { name: "Open settings" }).first().click();
    await page.getByRole("button", { name: /^Add (?:another )?source$/ }).click();
    await page.getByLabel(/Playlist name/).fill("M3U sentinel");
    await page.getByLabel(/Playlist URL/).fill(`${mock.url}/playlist.m3u?token=${TOKEN}`);
    await page.getByRole("button", { name: "Connect source" }).click();
    await waitForImport(page);
    // play a stream that cannot load, so the failure paths run
    await page.getByRole("button", { name: "Live TV" }).first().click();
    await page.getByRole("button", { name: /^Play / }).first().click();
    await page.getByText(/Couldn't play this stream|could not|unable/i).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
    await page.keyboard.press("Escape");
    // capture the diagnostics file the app would download
    await page.evaluate(() => {
      window.__blobs = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        window.__blobs.push(blob);
        return original(blob);
      };
    });
    await page.getByRole("button", { name: "Open settings" }).first().click();
    await page.getByRole("button", { name: /Download diagnostic log/ }).click();
    await page.waitForFunction(() => window.__blobs.length > 0, undefined, { timeout: 15_000 });
    const diagnostics = await page.evaluate(() => window.__blobs[0].text());
    where.diagnosticsExport = Object.entries(NEEDLES).filter(([, needle]) => diagnostics.includes(needle)).map(([label]) => label);
    const storage = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
    where.localStorage = Object.entries(NEEDLES).filter(([, needle]) => storage.includes(needle)).map(([label]) => label);
  } finally {
    await app.stop();
    await mock.close();
  }
  const dirs = perfDataDirs();
  const files = scanFiles([dirs.roaming, dirs.local]);
  writeFileSync(join(RESULTS_DIR, "credential-scan-files.json"), JSON.stringify(files, null, 2));
  console.log(JSON.stringify({ where, files }, null, 1));
  console.log(`saved ${writeResult("credential-scan", { where, files })}`);
}

await main();
