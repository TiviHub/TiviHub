import type { DrmSystem, Episode, LiveChannel, Movie, Series } from "../types";
import { readResponseText, validateHttpsUrl } from "./http";

export const MAX_M3U_BYTES = 200 * 1024 * 1024;

interface PlaylistContext {
  id: string;
  name: string;
  url?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
}

export interface M3uCatalog {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
}

interface PendingEntry {
  attributes: Record<string, string>;
  name: string;
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

function episodeDetails(entry: PendingEntry, index: number): {
  seriesName: string;
  season: number;
  number: number;
  name: string;
} {
  const attributes = entry.attributes;
  const groupParts = (attributes["group-title"] ?? "")
    .split(/\s*(?:\||\/|>)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const seriesGroupIndex = groupParts.findIndex((part) => /\b(series|shows|tv shows)\b/i.test(part));
  const groupedName = seriesGroupIndex >= 0
    ? groupParts.slice(seriesGroupIndex + 1).find((part) => !/^season\s*\d+$/i.test(part))
    : undefined;
  const explicitSeriesName = attributes["series-title"] || attributes["series-name"] || groupedName;
  const title = entry.name || attributes["tvg-name"] || attributes["tvg-id"] || "Episode";
  const marker = /(?:\bS(\d{1,2})\s*E(\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b)\s*[-_.:]?\s*(.*)$/i.exec(title);
  const rawSeason = Number(attributes.season ?? attributes["tvg-season"] ?? marker?.[1] ?? marker?.[3] ?? 1);
  const rawNumber = Number(attributes.episode ?? attributes["tvg-episode"] ?? marker?.[2] ?? marker?.[4] ?? index + 1);
  const season = Number.isInteger(rawSeason) && rawSeason > 0 ? rawSeason : 1;
  const number = Number.isInteger(rawNumber) && rawNumber > 0 ? rawNumber : index + 1;
  const seriesName = explicitSeriesName ??
    (marker ? title.slice(0, marker.index).trim().replace(/[\s\-_.:|]+$/, "") : "");

  return {
    seriesName: seriesName || title,
    season,
    number,
    name: marker?.[5]?.trim() || (seriesName ? `Episode ${number}` : title),
  };
}

function itemKind(group: string): "live" | "movie" | "series" {
  if (/\b(series|tv shows|tv-show|tvshows|shows)\b/i.test(group)) return "series";
  if (/\b(movie|movies|film|films|vod)\b/i.test(group)) return "movie";
  return "live";
}

export function parseM3uCatalog(content: string, context: PlaylistContext): M3uCatalog {
  if (new TextEncoder().encode(content).byteLength > MAX_M3U_BYTES) {
    throw new Error("Playlist is larger than the supported 200 MB limit.");
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.some((line) => line.trim().toUpperCase().startsWith("#EXTM3U"))) {
    throw new Error("This file is not a valid extended M3U playlist (missing #EXTM3U).");
  }

  const channels: LiveChannel[] = [];
  const movies: Movie[] = [];
  const series: Series[] = [];
  const episodes: Episode[] = [];
  const seriesByName = new Map<string, Series>();
  let pending: PendingEntry | null = null;
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
    const group = metadata.attributes["group-title"]?.trim() || "General";
    const logoUrl = metadata.attributes["tvg-logo"] ||
      metadata.attributes.logo ||
      metadata.attributes.poster ||
      metadata.attributes.cover ||
      undefined;
    const kind = itemKind(group);
    if (kind === "movie") {
      const year = Number(/\((\d{4})\)/.exec(name)?.[1] ?? metadata.attributes.year);
      const rating = Number(metadata.attributes.rating);
      movies.push({
        id: `${context.id}:movie:${movies.length}`,
        playlistId: context.id,
        name,
        streamUrl,
        posterUrl: logoUrl,
        overview: metadata.attributes.description || undefined,
        year: Number.isInteger(year) && year > 1800 ? year : undefined,
        rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
        category: group,
        drmLicenseUrl,
        drmSystem: context.drmSystem,
      });
    } else if (kind === "series") {
      const detail = episodeDetails(metadata, episodes.length);
      const seriesKey = detail.seriesName.trim().toLocaleLowerCase();
      let seriesItem = seriesByName.get(seriesKey);
      if (!seriesItem) {
        seriesItem = {
          id: `${context.id}:series:${series.length}`,
          playlistId: context.id,
          name: detail.seriesName,
          posterUrl: logoUrl,
          overview: metadata.attributes.description || undefined,
          seasons: detail.season,
          category: group,
          year: undefined,
          rating: undefined,
        };
        seriesByName.set(seriesKey, seriesItem);
        series.push(seriesItem);
      } else {
        seriesItem.seasons = Math.max(seriesItem.seasons, detail.season);
      }
      episodes.push({
        id: `${context.id}:episode:${episodes.length}`,
        playlistId: context.id,
        seriesId: seriesItem.id,
        season: detail.season,
        number: detail.number,
        name: detail.name,
        streamUrl,
        posterUrl: logoUrl,
        drmLicenseUrl,
        drmSystem: context.drmSystem,
      });
    } else {
      channels.push({
        id: `${context.id}:live:${channels.length}`,
        playlistId: context.id,
        name,
        group,
        streamUrl,
        logoUrl,
        tvgId: metadata.attributes["tvg-id"] || undefined,
        drmLicenseUrl,
        drmSystem: context.drmSystem,
      });
    }
    pending = null;
  }

  if (channels.length + movies.length + episodes.length === 0) {
    throw new Error("No media entries were found in this playlist.");
  }
  return { channels, movies, series, episodes };
}

export function parseM3u(content: string, context: PlaylistContext): LiveChannel[] {
  const catalog = parseM3uCatalog(content, context);
  if (catalog.channels.length === 0) {
    throw new Error("No channel entries were found in this playlist.");
  }
  return catalog.channels;
}

export async function fetchM3u(url: string, signal?: AbortSignal): Promise<string> {
  const parsed = validateHttpUrl(url, "playlist URL");
  let response: Response;
  try {
    response = await fetch(parsed, { signal, headers: { Accept: "application/x-mpegURL, text/plain, */*" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      "The playlist could not be fetched by TiviHub. The provider may block cross-origin access (CORS); try importing the M3U file instead.",
    );
  }
  if (!response.ok) throw new Error(`Playlist request failed with HTTP ${response.status}.`);
  return readResponseText(response, MAX_M3U_BYTES, "Playlist");
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
