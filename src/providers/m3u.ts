import type { DrmSystem, Episode, LiveChannel, Movie, Series } from "../types";
import { catchupFromAttributes } from "../catchup";
import { recordDiagnosticFailure } from "../diagnosticLog";
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
  /** Entries left out because their stream is not HTTP or HTTPS. */
  skipped: number;
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

function resolveStream(value: string, baseUrl?: string): string | null {
  let result: URL;
  try {
    result = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    throw new Error(
      "This playlist contains a relative stream URL. Add its original playlist URL as the base address.",
    );
  }
  // rtmp://, rtsp:// and udp:// entries cannot play here; the caller skips them instead of failing the import.
  if (result.protocol !== "http:" && result.protocol !== "https:") return null;
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

// `radio="true"` marks a station; without the attribute a group named "Radio" does the same. `radio="false"` opts out.
function isRadio(attributes: Record<string, string>, group: string): boolean {
  const declared = attributes.radio?.trim().toLowerCase();
  if (declared === "true") return true;
  if (declared === "false") return false;
  return /\bradio\b/i.test(group);
}

function itemKind(group: string): "live" | "movie" | "series" {
  if (/\b(series|tv shows|tv-show|tvshows|shows)\b/i.test(group)) return "series";
  if (/\b(movie|movies|film|films|vod)\b/i.test(group)) return "movie";
  return "live";
}

function createM3uCatalogParser(context: PlaylistContext) {
  const channels: LiveChannel[] = [];
  const movies: Movie[] = [];
  const series: Series[] = [];
  const episodes: Episode[] = [];
  const seriesByName = new Map<string, Series>();
  let pending: PendingEntry | null = null;
  let hasHeader = false;
  let firstLine = true;
  let skipped = 0;
  const playlistDrmLicenseUrl = context.drmLicenseUrl;

  function processLine(rawLine: string) {
    let line = rawLine.trim();
    if (firstLine) {
      line = line.replace(/^\uFEFF/, "");
      firstLine = false;
    }
    if (line.toUpperCase().startsWith("#EXTM3U")) hasHeader = true;
    if (!line) return;

    if (line.toUpperCase().startsWith("#EXTINF:")) {
      const body = line.substring(line.indexOf(":") + 1);
      const separator = titleSeparator(body);
      const attributeText = separator >= 0 ? body.substring(0, separator) : body;
      const attributes = parseAttributes(attributeText);
      pending = {
        attributes,
        name: (separator >= 0 ? body.substring(separator + 1) : "").trim(),
      };
      return;
    }

    if (line.startsWith("#") || pending === null) return;

    const streamUrl = resolveStream(line, context.url);
    const metadata = pending;
    pending = null;
    if (streamUrl === null) {
      skipped += 1;
      return;
    }
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
        ...(isRadio(metadata.attributes, group) ? { radio: true } : {}),
        catchup: catchupFromAttributes(metadata.attributes),
        drmLicenseUrl,
        drmSystem: context.drmSystem,
      });
    }
  }

  function finish(): M3uCatalog {
    if (!hasHeader) {
      throw new Error("This file is not a valid extended M3U playlist (missing #EXTM3U).");
    }
    if (channels.length + movies.length + episodes.length === 0) {
      if (skipped > 0) throw new Error("Playlist entries must use HTTP or HTTPS stream URLs.");
      throw new Error("No media entries were found in this playlist.");
    }
    return { channels, movies, series, episodes, skipped };
  }

  return { processLine, finish };
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) byteLength += 1;
    else if (code <= 0x7ff) byteLength += 2;
    else if (
      code >= 0xd800 && code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      byteLength += 4;
      index += 1;
    } else byteLength += 3;
  }
  return byteLength;
}

function enforcePlaylistSize(byteLength: number) {
  if (byteLength > MAX_M3U_BYTES) {
    throw new Error("Playlist is larger than the supported 200 MB limit.");
  }
}

export function parseM3uCatalog(content: string, context: PlaylistContext): M3uCatalog {
  const parser = createM3uCatalogParser(context);
  let byteLength = 0;
  let offset = 0;
  while (offset <= content.length) {
    const newline = content.indexOf("\n", offset);
    const lineEnd = newline < 0 ? content.length : newline;
    const line = content.slice(offset, lineEnd);
    byteLength += utf8ByteLength(line) + (newline < 0 ? 0 : 1);
    enforcePlaylistSize(byteLength);
    parser.processLine(line);
    if (newline < 0) break;
    offset = newline + 1;
  }
  return parser.finish();
}

const M3U_PARSE_CHUNK_CHARS = 256 * 1024;

export async function parseM3uCatalogAsync(
  content: string,
  context: PlaylistContext,
  signal?: AbortSignal,
): Promise<M3uCatalog> {
  const parser = createM3uCatalogParser(context);
  let byteLength = 0;
  let offset = 0;
  let lineFragments: string[] = [];

  while (offset < content.length) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }
    let chunkEnd = Math.min(offset + M3U_PARSE_CHUNK_CHARS, content.length);
    if (
      chunkEnd < content.length &&
      content.charCodeAt(chunkEnd - 1) >= 0xd800 &&
      content.charCodeAt(chunkEnd - 1) <= 0xdbff &&
      content.charCodeAt(chunkEnd) >= 0xdc00 &&
      content.charCodeAt(chunkEnd) <= 0xdfff
    ) {
      chunkEnd += 1;
    }

    const chunk = content.slice(offset, chunkEnd);
    byteLength += utf8ByteLength(chunk);
    enforcePlaylistSize(byteLength);
    let lineStart = 0;
    while (lineStart < chunk.length) {
      const newline = chunk.indexOf("\n", lineStart);
      if (newline < 0) {
        lineFragments.push(chunk.slice(lineStart));
        break;
      }
      lineFragments.push(chunk.slice(lineStart, newline));
      parser.processLine(lineFragments.length === 1 ? lineFragments[0] : lineFragments.join(""));
      lineFragments = [];
      lineStart = newline + 1;
    }

    offset = chunkEnd;
    if (offset < content.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (lineFragments.length > 0) parser.processLine(lineFragments.join(""));
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }
  return parser.finish();
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
    recordDiagnosticFailure("m3u-playlist", "network");
    throw new Error(
      "The playlist could not be fetched by TiviHub. The provider may block cross-origin access (CORS); try importing the M3U file instead.",
      { cause: error },
    );
  }
  if (!response.ok) {
    recordDiagnosticFailure("m3u-playlist", "http", response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `The playlist server denied access (HTTP ${response.status}). Check the playlist URL and your provider account access.`,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new Error(
        `The playlist server is temporarily unavailable (HTTP ${response.status}). Wait a moment and try again.`,
      );
    }
    throw new Error(`Playlist request failed with HTTP ${response.status}.`);
  }
  try {
    return await readResponseText(response, MAX_M3U_BYTES, "Playlist");
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    recordDiagnosticFailure("m3u-playlist", "invalid-response");
    throw cause;
  }
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
