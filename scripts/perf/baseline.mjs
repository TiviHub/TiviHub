// Cold-start and memory baseline against a seeded profile.
// Usage: node scripts/perf/baseline.mjs --size M --runs 5
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { launchApp } from "./launch.mjs";
import { restoreProfile } from "./profile.mjs";
import { stats, writeResult } from "./results.mjs";
import { processTreeMemory } from "./system.mjs";

const SETTLE_MS = 2_000;

/** Time from process start until the startup dialog is gone, measured from this script. */
async function timeToReady(page, startedAt, timeoutMs = 180_000) {
  const attachedAt = performance.now() - startedAt;
  const deadline = performance.now() + timeoutMs;
  let sawDialog = false;
  while (performance.now() < deadline) {
    const visible = await page.evaluate(() => Boolean(document.querySelector(".startup-overlay"))).catch(() => true);
    if (visible) sawDialog = true;
    else if (sawDialog || performance.now() - startedAt > attachedAt + 200) {
      return { readyMs: performance.now() - startedAt, attachedMs: attachedAt, sawDialog };
    }
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("The app never finished loading.");
}

async function heapMb(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const { metrics } = await session.send("Performance.getMetrics");
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return { jsUsedMb: Math.round(byName.JSHeapUsedSize / 1048576), jsTotalMb: Math.round(byName.JSHeapTotalSize / 1048576) };
}

export async function coldStartRun(size) {
  restoreProfile(size);
  const app = await launchApp();
  try {
    const timing = await timeToReady(app.page, app.startedAt);
    await new Promise((done) => setTimeout(done, SETTLE_MS));
    const memory = processTreeMemory(app.child.pid);
    return { ...timing, ...memory, ...(await heapMb(app.page)) };
  } finally {
    await app.stop();
  }
}

export async function startupBaseline(size, runs) {
  const results = [];
  await coldStartRun(size); // warm-up: file cache and first-run work, not reported
  for (let index = 0; index < runs; index += 1) {
    const run = await coldStartRun(size);
    results.push(run);
    console.log(`run ${index + 1}/${runs}: ready ${Math.round(run.readyMs)} ms, working set ${run.workingSetMb} MB, JS heap ${run.jsUsedMb} MB`);
  }
  const pick = (key) => stats(results.map((run) => run[key]));
  return {
    size,
    runs: results,
    summary: {
      readyMs: pick("readyMs"),
      workingSetMb: pick("workingSetMb"),
      privateMb: pick("privateMb"),
      jsUsedMb: pick("jsUsedMb"),
      dialogSeenInAllRuns: results.every((run) => run.sawDialog),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const size = arg("--size", "M");
  const runs = Number(arg("--runs", "5"));
  const result = await startupBaseline(size, runs);
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`saved ${writeResult(`startup-${size}`, result)}`);
}
