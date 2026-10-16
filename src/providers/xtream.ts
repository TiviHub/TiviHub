import type {
  Episode,
  EpgProgram,
  LiveChannel,
  Movie,
  Playlist,
  Series,
} from "../types";
import { readResponseText, validateHttpsUrl } from "./http";

interface XtreamPayload {
  [key: string]: unknown;
}

const MAX_XTREAM_RESPONSE_BYTES = 100 * 1024 * 1024;
const MAX_SHORT_EPG_RESPONSE_BYTES = 512 * 1024;
const MAX_SHORT_EPG_CHANNELS = 96;
const SHORT_EPG_PROGRAMS_PER_CHANNEL = 3;
const SHORT_EPG_CONCURRENCY = 4;

export interface XtreamCatalog {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  expiresAtMillis?: number;
}

export interface XtreamShortEpgResult {
  programs: EpgProgram[];
  requestedChannels: number;
  failedChannels: number;
  failureMessage?: string;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function apiBase(playlist: Playlist): URL {
  const url = new URL(playlist.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Xtream server URLs must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Put Xtream credentials in their own fields, not in the server URL.");
  }
  if (!url.pathname.endsWith("/player_api.php") && url.pathname !== "/player_api.php") {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/player_api.php`;
  }
  url.hash = "";
  return url;
}

function authenticatedUrl(
  playlist: Playlist,
  action?: string,
  parameters: Record<string, string> = {},
): string {
  if (!playlist.username.trim() || !playlist.password) {
    throw new Error("Enter the Xtream username and password.");
  }
  const url = apiBase(playlist);
  url.search = "";
  url.searchParams.set("username", playlist.username);
  url.searchParams.set("password", playlist.password);
  if (action) url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

export function xtreamStreamUrl(
  playlist: Playlist,
  type: "live" | "movie" | "series",
  id: string,
  extension: string,
): string {
  const base = apiBase(playlist);
  const apiPath = base.pathname.endsWith("/player_api.php")
    ? base.pathname.slice(0, -"/player_api.php".length)
    : "";
  const file = `${encodePathPart(id)}.${encodePathPart(extension || "mp4")}`;
  base.pathname = `${apiPath}/${type}/${encodePathPart(playlist.username)}/${encodePathPart(playlist.password)}/${file}`;
  base.username = "";
  base.password = "";
  base.search = "";
  return base.toString();
}

export function xtreamXmltvUrl(playlist: Playlist): string {
  const base = apiBase(playlist);
  const apiPath = base.pathname.endsWith("/player_api.php")
    ? base.pathname.slice(0, -"/player_api.php".length)
    : "";
  base.pathname = `${apiPath}/xmltv.php`;
  base.username = "";
  base.password = "";
  base.search = "";
  base.searchParams.set("username", playlist.username);
  base.searchParams.set("password", playlist.password);
  return base.toString();
}

async function requestJson(
  url: string,
  operation: string,
  signal?: AbortSignal,
  maxBytes = MAX_XTREAM_RESPONSE_BYTES,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: "application/json, text/plain, */*" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      `${operation} could not be reached. The server may block browser access (CORS), use HTTP from an HTTPS page, or be offline. The request went directly from this browser to the provider.`,
    );
  }
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}.`);
  const text = await readResponseText(response, maxBytes, operation);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}

function object(value: unknown): XtreamPayload | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as XtreamPayload
    : null;
}

function array(value: unknown, description: string, alternateKey?: string): XtreamPayload[] {
  const direct = Array.isArray(value) ? value : null;
  const nested = object(value)?.[alternateKey ?? "data"];
  const result = direct ?? (Array.isArray(nested) ? nested : null);
  if (!result) throw new Error(`${description} response did not contain a list.`);
  return result.map(object).filter((item): item is XtreamPayload => item !== null);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function epochMillis(value: unknown): number | undefined {
  const numeric = optionalNumber(value);
  if (numeric === undefined || numeric <= 0) return undefined;
  return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
}

function expiryMillis(value: unknown): number | undefined {
  const text = stringValue(value);
  if (!text || text === "null") return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = Date.parse(`${text}T00:00:00Z`);
    return Number.isFinite(date) ? date : undefined;
  }
  return undefined;
}

function drmFor(playlist: Playlist): Pick<LiveChannel, "drmLicenseUrl" | "drmSystem"> {
  return playlist.drmLicenseUrl
    ? {
        drmLicenseUrl: validateHttpsUrl(playlist.drmLicenseUrl, "DRM license URL"),
        drmSystem: playlist.drmSystem,
      }
    : {};
}

export async function authenticateXtream(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const payload = object(await requestJson(authenticatedUrl(playlist), "Xtream account check", signal));
  const userInfo = object(payload?.user_info);
  if (!userInfo) throw new Error("Xtream returned an unexpected authentication response.");
  const status = stringValue(userInfo.status ?? payload?.status)?.toLowerCase() ?? "";
  const auth = optionalNumber(userInfo.auth);
  if (auth === 0 || ["disabled", "expired", "unauthorized"].includes(status)) {
    throw new Error(stringValue(payload?.message) || `Xtream authentication was rejected (${status || "inactive"}).`);
  }
  return expiryMillis(userInfo.exp_date);
}

export async function loadXtreamCatalog(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<XtreamCatalog> {
  const expiresAtMillis = await authenticateXtream(playlist, signal);
  const [liveCategoriesRaw, liveRaw, movieCategoriesRaw, moviesRaw, seriesCategoriesRaw, seriesRaw] =
    await Promise.all([
      requestJson(authenticatedUrl(playlist, "get_live_categories"), "Live categories", signal),
      requestJson(authenticatedUrl(playlist, "get_live_streams"), "Live channels", signal),
      requestJson(authenticatedUrl(playlist, "get_vod_categories"), "Movie categories", signal),
      requestJson(authenticatedUrl(playlist, "get_vod_streams"), "Movies", signal),
      requestJson(authenticatedUrl(playlist, "get_series_categories"), "Series categories", signal),
      requestJson(authenticatedUrl(playlist, "get_series"), "Series", signal),
    ]);

  const liveCategories = new Map(array(liveCategoriesRaw, "Live categories", "categories")
    .flatMap((item) => {
      const id = stringValue(item.category_id);
      const name = stringValue(item.category_name);
      return id && name ? [[id, name] as const] : [];
    }));
  const movieCategories = new Map(array(movieCategoriesRaw, "Movie categories", "categories")
    .flatMap((item) => {
      const id = stringValue(item.category_id);
      const name = stringValue(item.category_name);
      return id && name ? [[id, name] as const] : [];
    }));
  const seriesCategories = new Map(array(seriesCategoriesRaw, "Series categories", "categories")
    .flatMap((item) => {
      const id = stringValue(item.category_id);
      const name = stringValue(item.category_name);
      return id && name ? [[id, name] as const] : [];
    }));
  const drm = drmFor(playlist);

  const channels = array(liveRaw, "Live channel", "channels").flatMap((item) => {
    const providerId = stringValue(item.stream_id);
    const name = stringValue(item.name);
    if (!providerId || !name) return [];
    const categoryId = stringValue(item.category_id);
    return [{
      id: `${playlist.id}:live:${providerId}`,
      playlistId: playlist.id,
      providerId,
      name,
      group: (categoryId && liveCategories.get(categoryId)) || "General",
      streamUrl: xtreamStreamUrl(playlist, "live", providerId, "m3u8"),
      logoUrl: stringValue(item.stream_icon),
      tvgId: stringValue(item.epg_channel_id),
      ...drm,
    }];
  });

  const movies = array(moviesRaw, "Movie", "movies").flatMap((item) => {
    const providerId = stringValue(item.stream_id);
    const name = stringValue(item.name);
    if (!providerId || !name) return [];
    const categoryId = stringValue(item.category_id);
    const extension = stringValue(item.container_extension) || "mp4";
    return [{
      id: `${playlist.id}:movie:${providerId}`,
      playlistId: playlist.id,
      providerId,
      name,
      streamUrl: xtreamStreamUrl(playlist, "movie", providerId, extension),
      posterUrl: stringValue(item.stream_icon),
      overview: stringValue(item.plot),
      year: Number((stringValue(item.releasedate) || stringValue(item.year) || "").slice(0, 4)) || undefined,
      rating: optionalNumber(item.rating) ?? optionalNumber(item.rating_5based),
      categoryId,
      category: categoryId ? movieCategories.get(categoryId) || "Uncategorized" : undefined,
      addedAtMillis: epochMillis(item.added),
      ...drm,
    }];
  });

  const series = array(seriesRaw, "Series", "series").flatMap((item) => {
    const providerId = stringValue(item.series_id);
    const name = stringValue(item.name);
    if (!providerId || !name) return [];
    const categoryId = stringValue(item.category_id);
    return [{
      id: `${playlist.id}:series:${providerId}`,
      playlistId: playlist.id,
      providerId,
      name,
      posterUrl: stringValue(item.cover),
      overview: stringValue(item.plot),
      seasons: Array.isArray(item.seasons) ? item.seasons.length : 0,
      categoryId,
      category: categoryId ? seriesCategories.get(categoryId) || "Uncategorized" : undefined,
      year: Number((stringValue(item.year) || "").slice(0, 4)) || undefined,
      rating: optionalNumber(item.rating) ?? optionalNumber(item.rating_5based),
      addedAtMillis: epochMillis(item.added) ?? epochMillis(item.last_modified),
    }];
  });

  return { channels, movies, series, expiresAtMillis };
}

export async function loadXtreamEpisodes(
  playlist: Playlist,
  series: Series,
  signal?: AbortSignal,
): Promise<Episode[]> {
  if (!series.providerId) throw new Error("This series does not have a provider ID.");
  const response = object(await requestJson(
    authenticatedUrl(playlist, "get_series_info", { series_id: series.providerId }),
    "Episode information",
    signal,
  ));
  const episodeSeasons = object(response?.episodes);
  if (!episodeSeasons) throw new Error("Xtream returned an unexpected episode response.");
  const episodes: Episode[] = [];

  for (const [seasonValue, rawEpisodes] of Object.entries(episodeSeasons)) {
    const season = Number(seasonValue) || 0;
    if (!Array.isArray(rawEpisodes)) continue;
    for (const rawEpisode of rawEpisodes) {
      const item = object(rawEpisode);
      if (!item) continue;
      const providerId = stringValue(item.id);
      const name = stringValue(item.title) || stringValue(item.name);
      if (!providerId || !name) continue;
      const info = object(item.info);
      const extension = stringValue(item.container_extension) || "mp4";
      episodes.push({
        id: `${playlist.id}:episode:${providerId}`,
        playlistId: playlist.id,
        providerId,
        seriesId: series.id,
        season,
        number: optionalNumber(item.episode_num) ?? 0,
        name,
        streamUrl: xtreamStreamUrl(playlist, "series", providerId, extension),
        overview: stringValue(info?.plot),
        posterUrl: stringValue(info?.movie_image),
        ...drmFor(playlist),
      });
    }
  }

  return episodes.sort((left, right) => left.season - right.season || left.number - right.number);
}

function decodeXtreamText(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(text) || text.length % 4 === 1) return text;
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!decoded || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(decoded)) return text;
    return decoded;
  } catch {
    return text;
  }
}

function programmeTime(value: unknown): number | undefined {
  const numeric = epochMillis(value);
  if (numeric !== undefined) return numeric;
  const text = stringValue(value);
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shortEpgProgramme(
  item: XtreamPayload,
  source: string,
  channelId: string,
  channelRecordId: string,
  index: number,
  now: number,
): EpgProgram | null {
  const startMillis = programmeTime(item.start_timestamp) ?? programmeTime(item.start);
  const endMillis = programmeTime(item.stop_timestamp) ??
    programmeTime(item.end_timestamp) ??
    programmeTime(item.end) ??
    programmeTime(item.stop);
  const title = decodeXtreamText(item.title);
  if (
    startMillis === undefined ||
    endMillis === undefined ||
    startMillis >= endMillis ||
    startMillis >= now + 24 * 60 * 60 * 1000 ||
    endMillis <= now - 2 * 60 * 60 * 1000 ||
    !title
  ) return null;
  const synopsis = decodeXtreamText(item.description);
  return {
    id: `${source}:${channelRecordId}:${startMillis}:${index}`,
    channelId,
    title,
    synopsis: synopsis || undefined,
    startMillis,
    endMillis,
    source,
  };
}

export async function loadXtreamShortEpg(
  playlist: Playlist,
  channels: LiveChannel[],
  signal?: AbortSignal,
): Promise<XtreamShortEpgResult> {
  if (channels.length > MAX_SHORT_EPG_CHANNELS) {
    throw new Error(`Request guide data for no more than ${MAX_SHORT_EPG_CHANNELS} channels at a time.`);
  }

  const withProviderIds = channels.flatMap((channel) =>
    channel.providerId ? [{ channel, providerId: channel.providerId }] : [],
  );
  const results: Array<{ programs: EpgProgram[]; failure?: string }> = new Array(withProviderIds.length);
  let nextIndex = 0;
  const now = Date.now();

  async function worker() {
    while (nextIndex < withProviderIds.length) {
      const index = nextIndex++;
      const { channel, providerId } = withProviderIds[index];
      const channelId = channel.tvgId || channel.id;
      try {
        const response = await requestJson(
          authenticatedUrl(playlist, "get_short_epg", {
            stream_id: providerId,
            limit: String(SHORT_EPG_PROGRAMS_PER_CHANNEL),
          }),
          "Xtream short EPG",
          signal,
          MAX_SHORT_EPG_RESPONSE_BYTES,
        );
        const entries = array(response, "Xtream short EPG", "epg_listings")
          .slice(0, SHORT_EPG_PROGRAMS_PER_CHANNEL);
        results[index] = {
          programs: entries.flatMap((entry, entryIndex) => {
            const program = shortEpgProgramme(entry, playlist.id, channelId, channel.id, entryIndex, now);
            return program ? [program] : [];
          }),
        };
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
        results[index] = {
          programs: [],
          failure: cause instanceof Error ? cause.message : "The provider did not return guide data.",
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SHORT_EPG_CONCURRENCY, withProviderIds.length) }, () => worker()),
  );

  const failedChannels = results.filter((result) => result.failure).length +
    channels.length - withProviderIds.length;
  return {
    programs: results.flatMap((result) => result.programs)
      .sort((left, right) => left.startMillis - right.startMillis),
    requestedChannels: channels.length,
    failedChannels,
    failureMessage: results.find((result) => result.failure)?.failure,
  };
}
