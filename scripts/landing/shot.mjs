/* global window */
// Captures the real app (browser mode) with an invented catalog and typographic posters, for the landing page.
// Usage: node scripts/landing/shot.mjs [outDir]   (dev server must be running)
import { chromium } from "@playwright/test";

const outDir = process.argv[2] ?? "public/landing";
const base = process.env.BASE ?? "http://localhost:5173";
const titles = ["Harbour Lights", "The Long Winter", "Signal Fires", "Paper Cities", "Night Shift", "Open Water", "Glass Hours", "Low Tide",
  "Silver Coast", "Quiet Engines", "Amber Road", "Northern Static", "Hollow Crown", "Salt & Smoke", "Velvet Hour", "Distant Fires",
  "Red Meridian", "Stone Garden", "Last Ferry", "Blue Archive"];
// Typographic posters in the app's palette: sans title set big on a dark surface, no imagery.
const poster = (i) => {
  const words = titles[i].toUpperCase().replace(" & ", " ").split(" ");
  const style = 0; // the glow treatment; others are kept in the list below
  const solid = style === 1;
  const ink = solid ? "#0b0b0c" : "#f2f2f5";
  const bg = [
    `<rect width="200" height="300" fill="#0f0f12"/><circle cx="170" cy="40" r="150" fill="url(#glow)"/>`,
    `<rect width="200" height="300" fill="url(#solid)"/>`,
    `<rect width="200" height="300" fill="#1a1a1f"/><rect x="0" y="0" width="200" height="6" fill="#8a4dff"/>`,
    `<rect width="200" height="300" fill="#0f0f12"/>${Array.from({ length: 9 }, (_, k) => `<rect x="0" y="${20 + k * 14}" width="200" height="3" fill="#8a4dff" opacity="${0.08 + k * 0.03}"/>`).join("")}`,
  ][style];
  const lines = words.map((w, k) => `<text x="16" y="${210 - (words.length - 1 - k) * 0 + k * 30 - (words.length - 1) * 30 + 40}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${w.length > 7 ? 22 : 28}" fill="${ink}">${w}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs>
<radialGradient id="glow"><stop offset="0" stop-color="#8a4dff" stop-opacity=".55"/><stop offset="1" stop-color="#8a4dff" stop-opacity="0"/></radialGradient>
<linearGradient id="solid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4dff"/><stop offset="1" stop-color="#4a1fa8"/></linearGradient>
<pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${solid ? "#000" : "#8a4dff"}" opacity=".25"/></pattern></defs>
${bg}<rect width="200" height="300" fill="url(#d)"/>${lines}
<text x="16" y="282" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${solid ? "#0b0b0c" : "#8a8a94"}">${2008 + (i % 17)}</text></svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "en-US" });
await page.route("https://posters.example/**", (route) => {
  const i = Number(route.request().url().match(/(\d+)\.svg/)?.[1] ?? 0);
  return route.fulfill({ contentType: "image/svg+xml", body: poster(i) });
});
await page.goto(`${base}/app.html`);
await page.getByRole("button", { name: "Open settings" }).first().click();
await page.getByRole("button", { name: "Add source" }).click();
await page.getByRole("button", { name: "Import demo" }).click();
await page.getByRole("button", { name: "Open settings" }).first().click();
await page.evaluate(async ({ titles }) => {
  const [db, { DEMO_PLAYLIST_ID: id, createDemoPlaylist }] = await Promise.all([import("/src/storage/database.ts"), import("/src/demo.ts")]);
  const now = Date.now();
  const hour = 3600000;
  const base = { drmLicenseUrl: "", drmSystem: "com.widevine.alpha", username: "", password: "", createdAt: now };
  await db.savePlaylist({ ...createDemoPlaylist(true), name: "Home playlist", demo: false, createdAt: now - 3 * hour, fileName: "home.m3u", lastCatalogRefreshAt: now - 2 * hour, lastCatalogRefreshOutcome: "success" });
  await db.savePlaylist({ ...base, id: "shot-xtream", name: "Provider login", type: "XTREAM", url: "https://provider.example", username: "viewer", password: "x", active: false, createdAt: now - 2 * hour, lastCatalogRefreshAt: now - 5 * hour, lastCatalogRefreshOutcome: "success" });
  await db.savePlaylist({ ...base, id: "shot-url", name: "Backup list", type: "M3U", url: "https://lists.example/backup.m3u", active: false, createdAt: now - hour, lastCatalogRefreshAt: now - 20 * hour, lastCatalogRefreshOutcome: "success" });

  const channelNames = ["Sport Live", "News 24", "Cinema One", "Nature HD", "Music Box", "Kids Zone", "Documentary", "Comedy Club"];
  const channels = channelNames.map((name, i) => ({ id: `${id}:ch:${i}`, playlistId: id, providerId: String(i + 1), name, group: "Live", tvgId: `ch${i}.example`, streamUrl: `https://provider.example/live/${i}.m3u8` }));
  const movies = titles.map((name, i) => ({
    id: `${id}:shot-movie:${i}`, playlistId: id, providerId: String(i + 1), name, streamUrl: `https://provider.example/movie/${i}.mp4`,
    posterUrl: `https://posters.example/${i}.svg`, year: 2008 + (i % 17), rating: 6 + (i % 4) * 0.7, category: "Drama", addedAtMillis: now - i * 86400000,
  }));
  await db.saveCatalog({ playlistId: id, channels, movies, series: [], episodes: [] });

  const shows = [["Pre-match", "Live match", "Review", "Studio"], ["Morning bulletin", "Weather", "Late edition", "Business"], ["Feature film", "Feature film", "Premiere", "Classics"],
    ["Wild coasts", "Night safari", "Deep blue", "Highlands"], ["Sessions", "Charts", "Unplugged", "Mixtape"], ["Cartoons", "Puzzle time", "Story hour", "Cartoons"],
    ["Archive", "Frontiers", "Ancient routes", "Archive"], ["Stand-up", "Panel night", "Sketches", "Stand-up"]];
  const start = Math.floor(now / hour) * hour - hour;
  const programs = channels.flatMap((channel, c) => {
    const out = [];
    let at = start - ((c * 17) % 40) * 60000;
    for (let k = 0; at < start + 7 * hour; k += 1) {
      const length = (45 + ((c * 3 + k * 5) % 4) * 25) * 60000;
      out.push({ id: `${id}:${c}:${k}`, channelId: channel.tvgId, title: shows[c][k % 4], startMillis: at, endMillis: at + length, source: id });
      at += length;
    }
    return out;
  });
  await db.replaceEpg(id, programs);

  const art = (i) => `https://posters.example/${i}.svg`;
  const watching = [[0, 72], [1, 35], [2, 90], [3, 12]];
  for (const [i, done] of watching) {
    await db.saveLibraryItem({ id: `lib-${i}`, contentId: movies[i].id, contentType: "MOVIE", playlistId: id, title: titles[i], streamUrl: movies[i].streamUrl, artworkUrl: art(i),
      status: "WATCHING", positionMillis: done * 60000, durationMillis: 100 * 60000, updatedAt: now - i * 1000 });
  }
  for (const i of [4, 5, 6, 7]) {
    await db.toggleFavorite({ id: `fav-${i}`, contentId: movies[i].id, contentType: "MOVIE", title: titles[i], playlistId: id, streamUrl: movies[i].streamUrl, artworkUrl: art(i), addedAt: now - i * 1000 });
  }
}, { titles });
await page.reload();

const shot = async (name) => {
  await page.mouse.move(1000, 400);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("wrote", name);
};

await page.getByRole("button", { name: /^Movies/ }).first().click();
await shot("app-hero");
await page.getByRole("button", { name: /^TV Guide/ }).first().click();
await shot("app-guide");
await page.getByRole("button", { name: /^Home/ }).first().click();
await shot("app-home");
await page.getByRole("button", { name: "Open settings" }).first().click();
await shot("app-sources");
await page.locator("#settings-privacy").scrollIntoViewIfNeeded();
await page.locator("#settings-privacy").evaluate((el) => { el.scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
await shot("app-privacy");
await browser.close();
