// Manages the perf build's data folders: reset, save a seeded copy, restore a copy.
// Every destructive call refuses any path that is not one of the perf build's own folders.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERF_IDENTIFIER, perfDataDirs } from "./launch.mjs";

const SEEDED = fileURLToPath(new URL("./seeded/", import.meta.url));

function assertPerfDir(dir) {
  if (!dir.endsWith(PERF_IDENTIFIER)) throw new Error(`Refusing to touch a folder that is not the perf build's: ${dir}`);
}

export function resetProfile() {
  for (const dir of Object.values(perfDataDirs())) {
    assertPerfDir(dir);
    // WebView2 child processes can hold files for a moment after the app is stopped, so retry.
    rmSync(dir, { recursive: true, force: true, maxRetries: 120, retryDelay: 250 });
  }
}

export function saveProfile(size) {
  const { roaming, local } = perfDataDirs();
  const target = join(SEEDED, size);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(roaming, join(target, "roaming"), { recursive: true });
  if (existsSync(local)) cpSync(local, join(target, "local"), { recursive: true });
}

export function hasSeededProfile(size) {
  return existsSync(join(SEEDED, size, "roaming"));
}

export function restoreProfile(size) {
  if (!hasSeededProfile(size)) throw new Error(`No seeded profile for size ${size}. Run: npm run perf:seed -- --size ${size}`);
  resetProfile();
  const { roaming, local } = perfDataDirs();
  cpSync(join(SEEDED, size, "roaming"), roaming, { recursive: true });
  if (existsSync(join(SEEDED, size, "local"))) cpSync(join(SEEDED, size, "local"), local, { recursive: true });
}
