import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

if (packageInfo.version !== tauriConfig.version) {
  throw new Error(`Version mismatch: package.json is ${packageInfo.version}, Tauri config is ${tauriConfig.version}.`);
}

const arch = { x64: "x64", arm64: "arm64" }[process.arch];
if (!arch) throw new Error(`Unsupported architecture: ${process.arch}`);

const platforms = {
  linux: [
    { bundle: "appimage", extension: ".AppImage", name: `TiviHub-v${packageInfo.version}-linux-${arch}.AppImage` },
    { bundle: "deb", extension: ".deb", name: `TiviHub-v${packageInfo.version}-linux-${arch}.deb` },
  ],
  darwin: [{ bundle: "dmg", extension: ".dmg", name: `TiviHub-v${packageInfo.version}-macos-${arch}.dmg` }],
};
const outputs = platforms[process.platform];
if (!outputs) throw new Error(`Unsupported platform: ${process.platform}. Use package:windows on Windows.`);

if (!npmCli) throw new Error("Run this script through npm run package:unix.");
const result = spawnSync(
  process.execPath,
  [npmCli, "run", "tauri:build", "--", "--bundles", outputs.map((output) => output.bundle).join(",")],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const releaseDirectory = join(root, "dist", "releases");
mkdirSync(releaseDirectory, { recursive: true });

for (const output of outputs) {
  const bundleDirectory = join(root, "src-tauri", "target", "release", "bundle", output.bundle);
  const file = existsSync(bundleDirectory)
    ? readdirSync(bundleDirectory).find((name) => name.endsWith(output.extension))
    : undefined;
  if (!file) throw new Error(`Tauri did not produce a ${output.extension} bundle in ${bundleDirectory}`);
  const target = join(releaseDirectory, output.name);
  copyFileSync(join(bundleDirectory, file), target);
  console.log(`Staged release asset at ${target}`);
}
