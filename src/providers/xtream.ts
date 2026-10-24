import { normalizeImdbId, normalizeTmdbId } from "../lib/ratings";
import type {
  Episode,
  EpgProgram,
  LiveChannel,
  Movie,
  Playlist,
  Series,
} from "../types";
import { recordDiagnosticFailure } from "../lib/diagnosticLog";
import { t } from "../lib/i18n";
import type { MessageKey } from "../locales";
import { formatServerTime } from "../lib/serverTime";
import { readResponseText, validateHttpsUrl } from "./http";
import { providerFetch } from "./transport";
import type { BrowseCategory } from "../browse/types";

interface XtreamPayload {
  [key: string]: unknown;
}

const MAX_XTREAM_RESPONSE_BYTES = 200 * 1024 * 1024;
const MAX_SHORT_EPG_RESPONSE_BYTES = 512 * 1024;
export const XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE = 96;
const SHORT_EPG_PROGRAMS_PER_CHANNEL = 3;
const SHORT_EPG_CONCURRENCY = 4;

export interface XtreamCatalog {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  expiresAtMillis?: number;
  serverTimeZone?: string;
}

const OPERATION_KEYS: Record<string, MessageKey> = {
  "Xtream account check": "op.xtreamCheck",
  "Live categories": "op.liveCategories",
  "Live channels": "op.liveChannels",
  "Series categories": "op.seriesCategories",
  "Series": "op.series",
  "Movie categories": "op.movieCategories",
  "Movies": "op.movies",
};

// The call sites name an operation in English; the message shows it in the app language.
function operationName(operation: string): string {
  const key = OPERATION_KEYS[operation];
  return key ? t(key) : operation;
}

export class XtreamAccountExpiredError extends Error {
  constructor() {
    super(t("err.xtreamExpired"));
    this.name = "XtreamAccountExpiredError";
  }
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
    throw new Error(t("err.xtreamScheme"));
  }
  if (url.username || url.password) {
    throw new Error(t("err.xtreamCreds"));
  }
  if (!url.pathname.endsWith("/player_api.php")) {
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
    throw new Error(t("dlg.errXtream"));
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

/** Address of a recorded programme; the start is written in the server's own time zone. */
export function xtreamTimeshiftUrl(
  playlist: Playlist,
  providerId: string,
  startMillis: number,
  endMillis: number,
): string {
  const base = apiBase(playlist);
  const apiPath = base.pathname.endsWith("/player_api.php")
    ? base.pathname.slice(0, -"/player_api.php".length)
    : "";
  const minutes = Math.max(1, Math.ceil((endMillis - startMillis) / 60_000));
  const start = formatServerTime(startMillis, playlist.serverTimeZone);
  base.pathname = `${apiPath}/timeshift/${encodePathPart(playlist.username)}/${encodePathPart(playlist.password)}/${minutes}/${start}/${encodePathPart(providerId)}.m3u8`;
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
  userAgent: string | undefined,
  url: string,
  operation: string,
  signal?: AbortSignal,
  maxBytes = MAX_XTREAM_RESPONSE_BYTES,
): Promise<unknown> {
  let response: Response;
  try {
    response = await providerFetch(url, {
      signal,
      headers: { Accept: "application/json, text/plain, */*" },
    }, userAgent);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    recordDiagnosticFailure("xtream-catalog", "network");
    throw new Error(
      t("err.xtreamNetwork", { operation: operationName(operation) }),
      { cause: error },
    );
  }
  if (!response.ok) {
    recordDiagnosticFailure("xtream-catalog", "http", response.status);
    if (response.status === 401) {
      throw new Error(
        t("err.xtream401", { operation: operationName(operation) }),
      );
    }
    if (response.status === 403) {
      throw new Error(
        t("err.xtream403", { operation: operationName(operation) }),
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new Error(
        t("err.xtreamUnavailable", { operation: operationName(operation), status: response.status }),
      );
    }
    throw new Error(t("err.xtreamHttp", { operation: operationName(operation), status: response.status }));
  }
  let text: string;
  try {
    text = await readResponseText(response, maxBytes, operationName(operation));
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    recordDiagnosticFailure("xtream-catalog", "invalid-response");
    throw cause;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    recordDiagnosticFailure("xtream-catalog", "invalid-response");
    throw new Error(t("err.xtreamJson", { operation: operationName(operation) }));
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
  if (!result) throw new Error(t("err.xtreamList", { description: operationName(description) }));
  return result.map(object).filter((item): item is XtreamPayload => item !== null);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function catalogYear(...values: unknown[]): number | undefined {
  for (const value of values) {
    const text = stringValue(value);
    if (!text) continue;
    const years = text.match(/\b(?:18|19|20|21|22)\d{2}\b/g);
    if (years?.length) return Number(years[years.length - 1]);
  }
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

function archiveFor(item: XtreamPayload): Pick<LiveChannel, "catchup"> {
  if (optionalNumber(item.tv_archive) !== 1) return {};
  const days = optionalNumber(item.tv_archive_duration);
  return { catchup: { mode: "xtream", days: days && days > 0 ? days : 1 } };
}

function drmFor(playlist: Playlist): Pick<LiveChannel, "drmLicenseUrl" | "drmSystem"> {
  return playlist.drmLicenseUrl
    ? {
        drmLicenseUrl: validateHttpsUrl(playlist.drmLicenseUrl, "DRM license URL"),
        drmSystem: playlist.drmSystem,
      }
    : {};
}

async function authenticate(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<{ expiresAtMillis?: number; serverTimeZone?: string }> {
  const payload = object(await requestJson(playlist.userAgent, authenticatedUrl(playlist), "Xtream account check", signal));
  const userInfo = object(payload?.user_info);
  if (!userInfo) throw new Error(t("err.xtreamAuthUnexpected"));
  const status = stringValue(userInfo.status ?? payload?.status)?.toLowerCase() ?? "";
  const auth = optionalNumber(userInfo.auth);
  const message = stringValue(payload?.message);
  if (status === "expired" || message?.toLowerCase().includes("expired")) {
    throw new XtreamAccountExpiredError();
  }
  if (auth === 0 || ["disabled", "unauthorized"].includes(status)) {
    throw new Error(message || t("err.xtreamRejected", { status: status || t("err.xtreamInactive") }));
  }
  return {
    expiresAtMillis: expiryMillis(userInfo.exp_date),
    serverTimeZone: stringValue(object(payload?.server_info)?.timezone),
  };
}

export async function authenticateXtream(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<number | undefined> {
  return (await authenticate(playlist, signal)).expiresAtMillis;
}

function categoryNames(raw: unknown, description: string): Map<string, string> {
  return new Map(array(raw, description, "categories").flatMap((item) => {
    const id = stringValue(item.category_id);
    const name = stringValue(item.category_name);
    return id && name ? [[id, name] as const] : [];
  }));
}

function liveChannelFrom(playlist: Playlist, item: XtreamPayload, categories: Map<string, string>): LiveChannel | null {
  const providerId = stringValue(item.stream_id);
  const name = stringValue(item.name);
  if (!providerId || !name) return null;
  const categoryId = stringValue(item.category_id);
  return {
    id: `${playlist.id}:live:${providerId}`,
    playlistId: playlist.id,
    providerId,
    name,
    group: (categoryId && categories.get(categoryId)) || "General",
    streamUrl: xtreamStreamUrl(playlist, "live", providerId, "m3u8"),
    logoUrl: stringValue(item.stream_icon),
    tvgId: stringValue(item.epg_channel_id),
    ...archiveFor(item),
    ...drmFor(playlist),
  };
}

/** The live categories only: one small request, so a source can be added without downloading its channels. */
export async function loadXtreamLiveCategories(playlist: Playlist, signal?: AbortSignal): Promise<BrowseCategory[]> {
  const raw = await requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_live_categories"), "Live categories", signal);
  return [...categoryNames(raw, "Live categories")].map(([id, name]) => ({ id, name }));
}

/** The channels of one live category (every channel when `categoryId` is null). */
export async function loadXtreamLiveChannels(
  playlist: Playlist,
  categoryId: string | null,
  categories: BrowseCategory[],
  signal?: AbortSignal,
): Promise<LiveChannel[]> {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const url = authenticatedUrl(playlist, "get_live_streams", categoryId ? { category_id: categoryId } : undefined);
  const raw = await requestJson(playlist.userAgent, url, "Live channels", signal);
  return array(raw, "Live channel", "channels").flatMap((item) => {
    const channel = liveChannelFrom(playlist, item, names);
    return channel ? [channel] : [];
  });
}

function movieFrom(playlist: Playlist, item: XtreamPayload, categories: Map<string, string>): Movie | null {
  const providerId = stringValue(item.stream_id);
  const name = stringValue(item.name);
  if (!providerId || !name) return null;
  const categoryId = stringValue(item.category_id);
  const extension = stringValue(item.container_extension) || "mp4";
  return {
    id: `${playlist.id}:movie:${providerId}`,
    playlistId: playlist.id,
    providerId,
    name,
    streamUrl: xtreamStreamUrl(playlist, "movie", providerId, extension),
    posterUrl: stringValue(item.stream_icon),
    overview: stringValue(item.plot),
    year: catalogYear(item.releasedate, item.releaseDate, item.release_date, item.year, name),
    rating: optionalNumber(item.rating) ?? optionalNumber(item.rating_5based),
    imdbId: normalizeImdbId(item.imdb_id ?? item.imdb),
    tmdbId: normalizeTmdbId(item.tmdb ?? item.tmdb_id),
    categoryId,
    category: categoryId ? categories.get(categoryId) || "Uncategorized" : undefined,
    addedAtMillis: epochMillis(item.added),
    ...drmFor(playlist),
  };
}

function seriesFrom(playlist: Playlist, item: XtreamPayload, categories: Map<string, string>): Series | null {
  const providerId = stringValue(item.series_id);
  const name = stringValue(item.name);
  if (!providerId || !name) return null;
  const categoryId = stringValue(item.category_id);
  return {
    id: `${playlist.id}:series:${providerId}`,
    playlistId: playlist.id,
    providerId,
    name,
    posterUrl: stringValue(item.cover),
    overview: stringValue(item.plot),
    seasons: Array.isArray(item.seasons) ? item.seasons.length : 0,
    categoryId,
    category: categoryId ? categories.get(categoryId) || "Uncategorized" : undefined,
    year: catalogYear(item.year, item.releasedate, item.releaseDate, item.release_date, name),
    rating: optionalNumber(item.rating) ?? optionalNumber(item.rating_5based),
    imdbId: normalizeImdbId(item.imdb_id ?? item.imdb),
    tmdbId: normalizeTmdbId(item.tmdb ?? item.tmdb_id),
    addedAtMillis: epochMillis(item.added) ?? epochMillis(item.last_modified),
  };
}

/** The series categories only: one small request, so Series can open without downloading the catalog. */
export async function loadXtreamSeriesCategories(playlist: Playlist, signal?: AbortSignal): Promise<BrowseCategory[]> {
  const raw = await requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_series_categories"), "Series categories", signal);
  return [...categoryNames(raw, "Series categories")].map(([id, name]) => ({ id, name }));
}

/** The series of one category; an empty `categoryId` asks for every series in one answer. */
export async function loadXtreamSeries(
  playlist: Playlist,
  categoryId: string,
  categories: BrowseCategory[],
  signal?: AbortSignal,
): Promise<Series[]> {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const raw = await requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_series", categoryId ? { category_id: categoryId } : {}), "Series", signal);
  return array(raw, "Series", "series").flatMap((item) => {
    const show = seriesFrom(playlist, item, names);
    return show ? [show] : [];
  });
}

/** The movie categories only: one small request, so Movies can open without downloading the catalog. */
export async function loadXtreamMovieCategories(playlist: Playlist, signal?: AbortSignal): Promise<BrowseCategory[]> {
  const raw = await requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_vod_categories"), "Movie categories", signal);
  return [...categoryNames(raw, "Movie categories")].map(([id, name]) => ({ id, name }));
}

/** The movies of one category; an empty `categoryId` asks for every movie in one answer. */
export async function loadXtreamMovies(
  playlist: Playlist,
  categoryId: string,
  categories: BrowseCategory[],
  signal?: AbortSignal,
): Promise<Movie[]> {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const raw = await requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_vod_streams", categoryId ? { category_id: categoryId } : {}), "Movies", signal);
  return array(raw, "Movie", "movies").flatMap((item) => {
    const movie = movieFrom(playlist, item, names);
    return movie ? [movie] : [];
  });
}

/**
 * What the app imports for an Xtream source: the login details (expiry, time zone) and the live channels.
 * Movies and series are not downloaded here; they are read one category at a time while browsing.
 */
export async function loadXtreamLiveCatalog(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<{ channels: LiveChannel[]; expiresAtMillis?: number; serverTimeZone?: string }> {
  const { expiresAtMillis, serverTimeZone } = await authenticate(playlist, signal);
  const [categoriesRaw, liveRaw] = await Promise.all([
    requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_live_categories"), "Live categories", signal),
    requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_live_streams"), "Live channels", signal),
  ]);
  const categories = categoryNames(categoriesRaw, "Live categories");
  const channels = array(liveRaw, "Live channel", "channels").flatMap((item) => {
    const channel = liveChannelFrom(playlist, item, categories);
    return channel ? [channel] : [];
  });
  return { channels, expiresAtMillis, serverTimeZone };
}

/** The whole catalog in one go. The app no longer imports this way; tests and the perf scripts use it as a reference. */
export async function loadXtreamCatalog(
  playlist: Playlist,
  signal?: AbortSignal,
): Promise<XtreamCatalog> {
  const { expiresAtMillis, serverTimeZone } = await authenticate(playlist, signal);
  const [liveCategoriesRaw, liveRaw, movieCategoriesRaw, moviesRaw, seriesCategoriesRaw, seriesRaw] =
    await Promise.all([
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_live_categories"), "Live categories", signal),
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_live_streams"), "Live channels", signal),
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_vod_categories"), "Movie categories", signal),
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_vod_streams"), "Movies", signal),
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_series_categories"), "Series categories", signal),
      requestJson(playlist.userAgent, authenticatedUrl(playlist, "get_series"), "Series", signal),
    ]);

  const liveCategories = categoryNames(liveCategoriesRaw, "Live categories");
  const movieCategories = categoryNames(movieCategoriesRaw, "Movie categories");
  const seriesCategories = categoryNames(seriesCategoriesRaw, "Series categories");
  const channels = array(liveRaw, "Live channel", "channels").flatMap((item) => {
    const channel = liveChannelFrom(playlist, item, liveCategories);
    return channel ? [channel] : [];
  });

  const movies = array(moviesRaw, "Movie", "movies").flatMap((item) => {
    const movie = movieFrom(playlist, item, movieCategories);
    return movie ? [movie] : [];
  });

  const series = array(seriesRaw, "Series", "series").flatMap((item) => {
    const show = seriesFrom(playlist, item, seriesCategories);
    return show ? [show] : [];
  });

  return { channels, movies, series, expiresAtMillis, serverTimeZone };
}

export async function loadXtreamEpisodes(
  playlist: Playlist,
  series: Series,
  signal?: AbortSignal,
): Promise<Episode[]> {
  if (!series.providerId) throw new Error(t("err.xtreamNoProviderId"));
  const response = object(await requestJson(
    playlist.userAgent,
    authenticatedUrl(playlist, "get_series_info", { series_id: series.providerId }),
    "Episode information",
    signal,
  ));
  const episodeSeasons = object(response?.episodes);
  if (!episodeSeasons) throw new Error(t("err.xtreamEpisodes"));
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
    // eslint-disable-next-line no-control-regex -- detecting binary data is the point
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
  if (channels.length > XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE) {
    throw new Error(t("err.xtreamEpgBatch", { count: XTREAM_SHORT_EPG_CHANNEL_BATCH_SIZE }));
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
          playlist.userAgent,
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
