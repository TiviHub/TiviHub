// Times a full catalog refresh of the seeded source. Usage: node scripts/perf/refresh.mjs --size M --runs 3
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { launchApp, waitForReady } from "./launch.mjs";
import { MOCK_PORT, startMockXtream } from "./mockXtream.mjs";
import { restoreProfile } from "./profile.mjs";
import { stats, writeResult } from "./results.mjs";

export async function refreshRun(size) {
  restoreProfile(size);
  const mock = await startMockXtream({ size, port: MOCK_PORT });
  const app = await launchApp();
  try {
    await waitForReady(app.page, app.startedAt);
    await app.page.waitForTimeout(2_000);
    await app.page.evaluate(() => {
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
      }).observe({ type: "longtask" });
    });
    const button = app.page.getByRole("button", { name: "Refresh playlist" });
    const started = performance.now();
    await button.click();
    await button.waitFor(); // still attached
    await app.page.waitForFunction(
      () => document.querySelector('[aria-label="Refresh playlist"]')?.hasAttribute("disabled"),
      undefined,
      { timeout: 30_000 },
    );
    await app.page.waitForFunction(
      () => !document.querySelector('[aria-label="Refresh playlist"]')?.hasAttribute("disabled"),
      undefined,
      { timeout: 30 * 60_000 },
    );
    const wallMs = Math.round(performance.now() - started);
    await app.page.waitForTimeout(500);
    const tasks = await app.page.evaluate(() => window.__longTasks);
    return { wallMs, longTaskCount: tasks.length, longTaskMaxMs: Math.round(Math.max(0, ...tasks)) };
  } finally {
    await app.stop();
    await mock.close();
  }
}

export async function refreshBaseline(size, runs) {
  const results = [];
  for (let index = 0; index < runs; index += 1) {
    results.push(await refreshRun(size));
    console.log(`run ${index + 1}/${runs}: ${JSON.stringify(results[index])}`);
  }
  return {
    size,
    runs: results,
    summary: {
      wallMs: stats(results.map((r) => r.wallMs)),
      longTaskMaxMs: stats(results.map((r) => r.longTaskMaxMs)),
      longTaskCount: stats(results.map((r) => r.longTaskCount)),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
  const size = arg("--size", "M");
  const result = await refreshBaseline(size, Number(arg("--runs", "3")));
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`saved ${writeResult(`refresh-${size}`, result)}`);
}
