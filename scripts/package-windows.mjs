import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (process.platform === "win32") {
  const cargoBin = join(process.env.USERPROFILE ?? "", ".cargo", "bin");
  process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH ?? ""}`;
}

function runNpm(args, env = process.env) {
  if (!npmCli) throw new Error("Run this script through npm run package:windows.");
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNpm(["run", "tauri:build"]);
runNpm(["run", "build"], {
  ...process.env,
  VITE_WINDOWS_DOWNLOAD_URL: "/downloads/TiviHub-setup.exe",
});

const installer = join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  `TiviHub_${packageInfo.version}_x64-setup.exe`,
);
if (!existsSync(installer)) {
  throw new Error(`Tauri did not produce the expected Windows installer: ${installer}`);
}

const download = join(root, "dist", "site", "downloads", "TiviHub-setup.exe");
mkdirSync(dirname(download), { recursive: true });
copyFileSync(installer, download);
console.log(`Staged Windows installer at ${download}`);
