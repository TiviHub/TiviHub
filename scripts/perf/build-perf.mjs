// Builds the perf variant of the app: the normal release build with a different identifier,
// into its own cargo target dir so the normal build output is untouched.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERF_IDENTIFIER } from "./launch.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const result = spawnSync(
  "npx",
  ["tauri", "build", "--no-bundle", "--config", JSON.stringify({ identifier: PERF_IDENTIFIER })],
  { cwd: root, stdio: "inherit", shell: true, env: { ...process.env, CARGO_TARGET_DIR: join(root, "src-tauri", "target-perf") } },
);
process.exit(result.status ?? 1);
