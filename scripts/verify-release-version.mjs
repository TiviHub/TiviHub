import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const tag = process.env.GITHUB_REF_NAME;

if (packageInfo.version !== tauriConfig.version) {
  throw new Error(`Version mismatch: package.json is ${packageInfo.version}, Tauri config is ${tauriConfig.version}.`);
}

if (tag !== `v${packageInfo.version}`) {
  throw new Error(`Release tag ${tag ?? "(missing)"} must match the project version v${packageInfo.version}.`);
}

console.log(`Release tag ${tag} matches package.json and Tauri configuration.`);
