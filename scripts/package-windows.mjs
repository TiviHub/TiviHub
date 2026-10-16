import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

if (packageInfo.version !== tauriConfig.version) {
  throw new Error(`Version mismatch: package.json is ${packageInfo.version}, Tauri config is ${tauriConfig.version}.`);
}

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
  VITE_WINDOWS_DOWNLOAD_URL: `https://github.com/TiviHub/TiviHub/releases/download/v${packageInfo.version}/TiviHub-setup.exe`,
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

const releaseDirectory = join(root, "dist", "releases");
mkdirSync(releaseDirectory, { recursive: true });

const versionedInstaller = join(releaseDirectory, `TiviHub-v${packageInfo.version}-windows-x64.exe`);
const latestInstaller = join(releaseDirectory, "TiviHub-setup.exe");
copyFileSync(installer, versionedInstaller);
copyFileSync(installer, latestInstaller);
console.log(`Staged versioned release asset at ${versionedInstaller}`);
console.log(`Staged latest-release download asset at ${latestInstaller}`);
