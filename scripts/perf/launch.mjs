// Launches the perf build of the desktop app and attaches Playwright over CDP.
// The perf build is the normal app with the identifier nl.tivihub.perf (see scripts/perf/build-perf.mjs),
// so its data lives in its own folders and a real TiviHub library is never touched.
// WebView2 reads extra browser arguments from WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_EXE = join(root, "src-tauri", "target-perf", "release", "tivihub.exe");
export const PERF_IDENTIFIER = "nl.tivihub.perf";

/** The two folders the perf build writes to (SQLite and the WebView2 profile). */
export function perfDataDirs() {
  return {
    roaming: join(process.env.APPDATA, PERF_IDENTIFIER),
    local: join(process.env.LOCALAPPDATA, PERF_IDENTIFIER),
  };
}

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // the app is still starting
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`The app did not open a debugging port within ${timeoutMs} ms.`);
}

/** WebView2 helper processes outlive the app for a while and keep the data folder locked. */
async function waitForWebViewExit(timeoutMs = 60_000) {
  const script = `@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${PERF_IDENTIFIER}*' }).Count`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await new Promise((done) => {
      execFile("powershell", ["-NoProfile", "-Command", script], (error, stdout) => done(error ? 0 : Number(stdout.trim())));
    });
    if (count === 0) return;
    await new Promise((done) => setTimeout(done, 250));
  }
}

/**
 * Starts the perf build. Returns the page, the launch time, and stop().
 * `startedAt` is taken just before the process is spawned, so time-to-ready includes process start.
 */
export async function launchApp({ exe = DEFAULT_EXE, port = 9222, timeoutMs = 60_000 } = {}) {
  if (!existsSync(exe)) throw new Error(`Perf build not found: ${exe}. Run: npm run perf:build`);
  const startedAt = performance.now();
  const child = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: "ignore",
  });
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const kill = () => spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  try {
    await waitForCdp(port, timeoutMs);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.waitForEvent("page"));
    return {
      page,
      browser,
      child,
      startedAt,
      async stop() {
        await browser.close().catch(() => undefined);
        if (!exited) {
          await new Promise((done) => {
            child.once("exit", done);
            kill(); // /T also ends the msedgewebview2 children
          });
        }
        await waitForWebViewExit();
      },
    };
  } catch (error) {
    kill();
    throw error;
  }
}

/** Resolves when the startup dialog has been shown and then removed. Returns ms since `startedAt`. */
export async function waitForReady(page, startedAt, timeoutMs = 120_000) {
  const dialog = page.getByRole("dialog", { name: "Opening your library" });
  await dialog.waitFor({ state: "attached", timeout: timeoutMs }).catch(() => undefined);
  await dialog.waitFor({ state: "detached", timeout: timeoutMs });
  return performance.now() - startedAt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await launchApp();
  try {
    const readyMs = await waitForReady(app.page, app.startedAt);
    console.log(`ready after ${Math.round(readyMs)} ms`);
    console.log(`title: ${await app.page.title()}`);
    console.log(`data folder: ${perfDataDirs().roaming}`);
  } finally {
    await app.stop();
  }
}
