// Full matrix: seed if needed, then startup + memory, interactions and refresh per size, 5 runs each.
// Usage: node scripts/perf/all.mjs --sizes M,L,XL [--runs 5] [--label first]
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { startupBaseline } from "./baseline.mjs";
import { interactionBaseline } from "./interactions.mjs";
import { refreshBaseline } from "./refresh.mjs";
import { hasSeededProfile, saveProfile } from "./profile.mjs";
import { writeResult } from "./results.mjs";
import { seed } from "./seed.mjs";

export async function runMatrix(sizes, runs, label) {
  for (const size of sizes) {
    if (!hasSeededProfile(size)) {
      console.log(`seeding ${size}…`);
      console.log(JSON.stringify(await seed(size)));
      saveProfile(size);
    }
    const startup = await startupBaseline(size, runs);
    console.log(`saved ${writeResult(`${label}-startup-${size}`, startup)}`);
    const interactions = await interactionBaseline(size, runs);
    console.log(`saved ${writeResult(`${label}-interactions-${size}`, interactions)}`);
    const refresh = await refreshBaseline(size, runs);
    console.log(`saved ${writeResult(`${label}-refresh-${size}`, refresh)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
  await runMatrix(arg("--sizes", "M,L,XL").split(","), Number(arg("--runs", "5")), arg("--label", "matrix"));
}
