// Prints markdown tables from the matrix result files and compares two runs.
// Usage: node scripts/perf/summarize.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "./results.mjs";

function latest(label, kind, size) {
  const prefix = `${label}-${kind}-${size}-`;
  const file = readdirSync(RESULTS_DIR).filter((name) => name.startsWith(prefix) && name.endsWith(".json")).sort().at(-1);
  return file ? JSON.parse(readFileSync(join(RESULTS_DIR, file), "utf8")) : null;
}

const fmt = (s) => `${s.median} (${s.min}-${s.max})`;
const lines = [];

lines.push("### Startup and memory (median, range of 5 runs)", "", "| Size | Ready ms | Working set MB | Private MB | JS heap MB |", "|---|---|---|---|---|");
for (const size of ["M", "L", "XL"]) {
  const d = latest("run1", "startup", size);
  if (d) lines.push(`| ${size} | ${fmt(d.summary.readyMs)} | ${fmt(d.summary.workingSetMb)} | ${fmt(d.summary.privateMb)} | ${fmt(d.summary.jsUsedMb)} |`);
}

lines.push("", "### Interactions: worst long task in ms, median (range); wall time ms", "");
for (const size of ["M", "L", "XL"]) {
  const d = latest("run1", "interactions", size);
  if (!d) continue;
  lines.push(`**${size}**`, "", "| Interaction | Worst long task ms | Long tasks | Wall ms |", "|---|---|---|---|");
  for (const row of d.summary) lines.push(`| ${row.name} | ${fmt(row.longTaskMaxMs)} | ${row.longTaskCount.median} | ${fmt(row.wallMs)} |`);
  lines.push("");
}

lines.push("### Catalog refresh (full refresh against the mock provider)", "", "| Size | Wall ms | Worst long task ms | Long tasks |", "|---|---|---|---|");
for (const size of ["M", "L", "XL"]) {
  const d = latest("run1", "refresh", size);
  if (d) lines.push(`| ${size} | ${fmt(d.summary.wallMs)} | ${fmt(d.summary.longTaskMaxMs)} | ${d.summary.longTaskCount.median} |`);
}

lines.push("", "### Repeatability: run 1 vs run 2 on L (medians; difference as percent of run 1)", "", "| Metric | Run 1 | Run 2 | Difference |", "|---|---|---|---|");
const pct = (a, b) => (a === 0 ? "n/a" : `${Math.round(((b - a) / a) * 1000) / 10}%`);
const pairs = [];
const s1 = latest("run1", "startup", "L");
const s2 = latest("run2", "startup", "L");
if (s1 && s2) {
  for (const [label, key] of [["Ready ms", "readyMs"], ["Working set MB", "workingSetMb"]]) pairs.push([label, s1.summary[key].median, s2.summary[key].median]);
}
const i1 = latest("run1", "interactions", "L");
const i2 = latest("run2", "interactions", "L");
if (i1 && i2) {
  i1.summary.forEach((row, index) => pairs.push([`${row.name}: worst long task ms`, row.longTaskMaxMs.median, i2.summary[index].longTaskMaxMs.median]));
}
const r1 = latest("run1", "refresh", "L");
const r2 = latest("run2", "refresh", "L");
if (r1 && r2) pairs.push(["Refresh wall ms", r1.summary.wallMs.median, r2.summary.wallMs.median]);
for (const [label, a, b] of pairs) lines.push(`| ${label} | ${a} | ${b} | ${pct(a, b)} |`);

console.log(lines.join("\n"));
