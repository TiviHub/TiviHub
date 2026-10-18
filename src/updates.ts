const RELEASES_API_URL = "https://api.github.com/repos/TiviHub/TiviHub/releases?per_page=100";
const RELEASES_PAGE_ORIGIN = "https://github.com";
const INSTALLER_ASSET_NAME = "TiviHub-setup.exe";

interface SemanticVersion {
  major: string;
  minor: string;
  patch: string;
  prerelease: string[];
}

interface ReleaseInfo {
  version: string;
  url: string;
  assets: unknown[];
  prerelease: boolean;
  draft: boolean;
  tag: string;
}

export interface AvailableUpdate {
  version: string;
  installerUrl: string;
}

const semanticVersionPattern =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseVersion(value: string): SemanticVersion | null {
  const match = semanticVersionPattern.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
    return null;
  }
  return { major: match[1], minor: match[2], patch: match[3], prerelease };
}

function compareNumeric(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  return normalizedLeft === normalizedRight ? 0 : normalizedLeft < normalizedRight ? -1 : 1;
}

function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const part of ["major", "minor", "patch"] as const) {
    const comparison = compareNumeric(left[part], right[part]);
    if (comparison !== 0) return comparison;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const commonLength = Math.min(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < commonLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return compareNumeric(leftPart, rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  if (left.prerelease.length === right.prerelease.length) return 0;
  return left.prerelease.length < right.prerelease.length ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function releaseFrom(value: unknown): ReleaseInfo | null {
  if (!isRecord(value) ||
      typeof value.tag_name !== "string" ||
      typeof value.html_url !== "string" ||
      !Array.isArray(value.assets) ||
      typeof value.prerelease !== "boolean" ||
      typeof value.draft !== "boolean") {
    return null;
  }
  const parsedVersion = parseVersion(value.tag_name);
  if (!parsedVersion) return null;
  return {
    version: value.tag_name.replace(/^v/, ""),
    url: value.html_url,
    assets: value.assets,
    prerelease: parsedVersion.prerelease.length > 0,
    draft: value.draft,
    tag: value.tag_name,
  };
}

function hasInstaller(release: ReleaseInfo): boolean {
  return release.assets.some((asset) => isRecord(asset) && asset.name === INSTALLER_ASSET_NAME);
}

function isSafeReleasePage(release: ReleaseInfo): boolean {
  try {
    const url = new URL(release.url);
    return url.origin === RELEASES_PAGE_ORIGIN &&
      url.pathname === `/TiviHub/TiviHub/releases/tag/${release.tag}`;
  } catch {
    return false;
  }
}

export function latestAvailableUpdate(
  payload: unknown,
  currentVersion: string,
): AvailableUpdate | null {
  const current = parseVersion(currentVersion);
  if (!current) throw new Error(`The installed app version is not valid: ${currentVersion}`);
  if (!Array.isArray(payload)) throw new Error("GitHub returned an invalid releases list.");

  const candidates = payload
    .map(releaseFrom)
    .filter((release): release is ReleaseInfo => release !== null)
    .filter((release) =>
      !release.draft &&
      (current.prerelease.length > 0 || !release.prerelease) &&
      hasInstaller(release) &&
      isSafeReleasePage(release) &&
      compareVersions(parseVersion(release.version)!, current) > 0,
    )
    .sort((left, right) =>
      compareVersions(parseVersion(right.version)!, parseVersion(left.version)!));

  const latest = candidates[0];
  return latest
    ? {
      version: latest.version,
      installerUrl: `https://github.com/TiviHub/TiviHub/releases/download/${latest.tag}/${INSTALLER_ASSET_NAME}`,
    }
    : null;
}

export async function checkForUpdate(
  currentVersion: string,
  signal?: AbortSignal,
): Promise<AvailableUpdate | null> {
  const response = await fetch(RELEASES_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status} while checking releases.`);
  }
  return latestAvailableUpdate(await response.json() as unknown, currentVersion);
}
