import type { DrmSystem, LiveChannel } from "../types";
import { readResponseText, validateHttpsUrl } from "./http";

const MAX_PLAYLIST_BYTES = 25 * 1024 * 1024;

interface PlaylistContext {
  id: string;
  name: string;
  url?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function titleSeparator(value: string): number {
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === character) quote = null;
    else if (quote === null && (character === '"' || character === "'")) quote = character;
    else if (quote === null && character === ",") return index;
  }
  return -1;
}

function resolveStream(value: string, baseUrl?: string): string {
  let result: URL;
  try {
    result = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    throw new Error(
      "This playlist contains a relative stream URL. Add its original playlist URL as the base address.",
    );
  }
  if (result.protocol !== "http:" && result.protocol !== "https:") {
    throw new Error("Playlist entries must use HTTP or HTTPS stream URLs.");
  }
  return result.toString();
}

export function parseM3u(content: string, context: PlaylistContext): LiveChannel[] {
  if (new TextEncoder().encode(content).byteLength > MAX_PLAYLIST_BYTES) {
    throw new Error("Playlist is larger than the supported 25 MB limit.");
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.some((line) => line.trim().toUpperCase().startsWith("#EXTM3U"))) {
    throw new Error("This file is not a valid extended M3U playlist (missing #EXTM3U).");
  }

  const channels: LiveChannel[] = [];
  let pending: { name: string; attributes: Record<string, string> } | null = null;
  const playlistDrmLicenseUrl = context.drmLicenseUrl;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase().startsWith("#EXTINF:")) {
      const body = line.substring(line.indexOf(":") + 1);
      const separator = titleSeparator(body);
      const attributeText = separator >= 0 ? body.substring(0, separator) : body;
      const attributes = parseAttributes(attributeText);
      pending = {
        attributes,
        name: (separator >= 0 ? body.substring(separator + 1) : "").trim(),
      };
      continue;
    }

    if (line.startsWith("#") || pending === null) continue;

    const streamUrl = resolveStream(line, context.url);
    const metadata = pending;
    const name = metadata.name ||
      metadata.attributes["tvg-name"] ||
      metadata.attributes["tvg-id"] ||
      streamUrl;
    const rawDrmLicenseUrl = metadata.attributes["drm-url"] ||
      metadata.attributes["license-url"] ||
      playlistDrmLicenseUrl;
    const drmLicenseUrl = rawDrmLicenseUrl
      ? validateHttpsUrl(rawDrmLicenseUrl, "DRM license URL")
      : undefined;
    const id = `${context.id}:live:${channels.length}`;
    channels.push({
      id,
      playlistId: context.id,
      name,
      group: metadata.attributes["group-title"]?.trim() || "General",
      streamUrl,
      logoUrl: metadata.attributes["tvg-logo"] || metadata.attributes.logo || undefined,
      tvgId: metadata.attributes["tvg-id"] || undefined,
      drmLicenseUrl,
      drmSystem: context.drmSystem,
    });
    pending = null;
  }

  if (channels.length === 0) {
    throw new Error("No channel entries were found in this playlist.");
  }
  return channels;
}

export async function fetchM3u(url: string, signal?: AbortSignal): Promise<string> {
  const parsed = validateHttpUrl(url, "playlist URL");
  let response: Response;
  try {
    response = await fetch(parsed, { signal, headers: { Accept: "application/x-mpegURL, text/plain, */*" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      "The playlist could not be fetched by this browser. The provider may block cross-origin browser access (CORS); try importing the M3U file instead.",
    );
  }
  if (!response.ok) throw new Error(`Playlist request failed with HTTP ${response.status}.`);
  return readResponseText(response, MAX_PLAYLIST_BYTES, "Playlist");
}

export function validateHttpUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Enter a valid ${label}.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return url.toString();
}
