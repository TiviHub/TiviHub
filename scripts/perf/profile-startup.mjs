// CPU profile of startup via CDP. Usage: node scripts/perf/profile-startup.mjs --size L
// The profiler starts when the script attaches (a few hundred ms after launch), so the earliest
// part of startup is not covered; the note says so.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { launchApp } from "./launch.mjs";
import { restoreProfile } from "./profile.mjs";
import { RESULTS_DIR, writeResult } from "./results.mjs";

export function summarize(profile, topCount = 15) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMicros = new Map();
  profile.samples.forEach((id, index) => {
    selfMicros.set(id, (selfMicros.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  const byFunction = new Map();
  let total = 0;
  for (const [id, micros] of selfMicros) {
    const { callFrame } = byId.get(id);
    const key = `${callFrame.functionName || "(anonymous)"} ${callFrame.url.split("/").slice(-2).join("/")}:${callFrame.lineNumber}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + micros);
    total += micros;
  }
  const top = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, topCount)
    .map(([name, micros]) => ({ name, selfMs: Math.round(micros / 1000), sharePct: Math.round((micros / total) * 1000) / 10 }));
  return { totalMs: Math.round(total / 1000), top };
}

/**
 * Times the three startup reads on the seeded database with the release Rust store, outside the
 * app: Rust query and serialization plus a pipe, then JSON.parse. The app's own IPC is not
 * reachable from the debugging port (Tauri's internals are not visible to injected scripts).
 */
export async function rustReadBreakdown(size) {
  const exe = fileURLToPath(new URL("../../src-tauri/target/release/examples/storage_harness.exe", import.meta.url));
  if (!existsSync(exe)) throw new Error("Build the harness first: cargo build --release --example storage_harness --manifest-path src-tauri/Cargo.toml");
  const database = join(process.env.APPDATA, "nl.tivihub.perf", "tivihub.sqlite3");
  const child = spawn(exe, [database]);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const call = async (command, args) => {
    child.stdin.write(`${JSON.stringify({ id: 1, command, args })}
`);
    const reply = JSON.parse((await lines.next()).value);
    if (reply.error) throw new Error(reply.error);
    return reply.ok;
  };
  try {
    const playlists = JSON.parse(await call("storage_get_all", { storeName: "playlists" }));
    const out = {};
    for (const store of ["channels", "movies", "series"]) {
      const t0 = performance.now();
      const text = await call("storage_get_all_by_index", { storeName: store, index: "byPlaylist", value: playlists[0].id });
      const t1 = performance.now();
      const rows = JSON.parse(text);
      const t2 = performance.now();
      out[store] = { rows: rows.length, megabytes: Math.round(text.length / 1048576), rustAndPipeMs: Math.round(t1 - t0), jsonParseMs: Math.round(t2 - t1) };
    }
    return out;
  } finally {
    child.kill();
  }
}

export async function profileStartup(size) {
  restoreProfile(size);
  const app = await launchApp();
  try {
    const session = await app.page.context().newCDPSession(app.page);
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 500 });
    await session.send("Profiler.start");
    const startedAt = performance.now();
    await app.page.waitForFunction(() => !document.querySelector(".startup-overlay"), undefined, { timeout: 180_000 });
    const readyAfterAttachMs = Math.round(performance.now() - startedAt);
    const { profile } = await session.send("Profiler.stop");
    return { size, readyAfterAttachMs, profile, summary: summarize(profile) };
  } finally {
    await app.stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--size");
  const size = index >= 0 ? process.argv[index + 1] : "L";
  const result = await profileStartup(size);
  writeFileSync(join(RESULTS_DIR, `startup-profile-${size}.cpuprofile`), JSON.stringify(result.profile));
  console.log(`profiled ${result.summary.totalMs} ms of samples; ready ${result.readyAfterAttachMs} ms after attach`);
  console.table(result.summary.top);
  const reads = await rustReadBreakdown(size);
  console.log(JSON.stringify(reads));
  console.log(`saved ${writeResult(`startup-profile-${size}`, { size, readyAfterAttachMs: result.readyAfterAttachMs, summary: result.summary, rustReads: reads })}`);
}
