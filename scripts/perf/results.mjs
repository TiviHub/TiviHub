import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitCommit, machine } from "./system.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const RESULTS_DIR = join(root, "scripts", "perf", "results");

export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const min = sorted[0];
  const max = sorted.at(-1);
  return {
    n: sorted.length,
    median: round(median),
    min: round(min),
    max: round(max),
    spreadPct: median === 0 ? 0 : round(((max - min) / median) * 100),
  };
}

const round = (value) => Math.round(value * 10) / 10;

export function writeResult(name, body) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(RESULTS_DIR, `${name}-${stamp}.json`);
  const record = { name, at: new Date().toISOString(), ...gitCommit(root), machine: machine(), build: "perf build of the packaged release executable", ...body };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}
