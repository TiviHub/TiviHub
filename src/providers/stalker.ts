import { recordDiagnosticFailure } from "../lib/diagnosticLog";
import type { BrowseCategory } from "../browse/types";
import type { Episode, EpgProgram, LiveChannel, Movie, Playlist, Series } from "../types";
import { normalizeImdbId, normalizeTmdbId } from "../lib/ratings";
import { readResponseText } from "./http";
import { providerFetch } from "./transport";
import { catalogYear } from "./xtream";

// Stalker (Ministra) portals identify a "set-top box" by its MAC address. A web view cannot send the
// Cookie and User-Agent headers they need, so every request goes through the desktop backend.

export const STALKER_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";
const STB_MODEL = "Model: MAG250; Link: WiFi";
const MAX_PORTAL_RESPONSE_BYTES = 200 * 1024 * 1024;
const EPG_PERIOD_HOURS = 6;
const MAX_PORTAL_REQUESTS = 4;
const DEFAULT_WATCHDOG_SECONDS = 120;

/** How long to wait before repeating a request the portal answered with "too many requests"; tests shorten it. */
export const retryPolicy = { delaysMillis: [2000, 5000, 10_000] };

/** Stream addresses are only known when you press play, so the catalog keeps this stand-in. */
export const STALKER_LINK_HOST = "stalker.invalid";

type Payload = Record<string, unknown>;
type LinkType = "itv" | "vod";

export function normalizeMac(value: string): string | null {
  const hex = value.trim().replace(/[:\-.\s]/g, "").toUpperCase();
  return /^[0-9A-F]{12}$/.test(hex) ? hex.match(/../g)!.join(":") : null;
}

/** The `load.php` endpoint behind a portal address as people usually paste it (`…/c/`, `…/stalker_portal/c/`, the host alone). */
export function stalkerApiUrl(portalUrl: string): string {
  const url = new URL(portalUrl.trim());
  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/, "");
  if (/\/(?:load|portal)\.php$/.test(path)) {
    url.pathname = path;
  } else {
    path = path.replace(/\/c$/, "");
    url.pathname = `${path}/server/load.php`;
  }
  return url.toString();
}

/** `series` is the episode number for portals that keep every episode of a season under one command. */
export function stalkerLink(cmd: string, type: LinkType, series?: number): string {
  const episode = series === undefined ? "" : `&series=${series}`;
  return `http://${STALKER_LINK_HOST}/link?type=${type}&cmd=${encodeURIComponent(cmd)}${episode}`;
}

export function isStalkerLink(url: string): boolean {
  try {
    return new URL(url).hostname === STALKER_LINK_HOST;
  } catch {
    return false;
  }
}

/** Movies and episodes come back as one plain video file; live channels may be a stream playlist. */
export function isStalkerVideoLink(link: string): boolean {
  return parseLink(link)?.type === "vod";
}

function parseLink(url: string): { type: LinkType; cmd: string; series: string } | null {
  try {
    const parsed = new URL(url);
    const cmd = parsed.searchParams.get("cmd");
    return parsed.hostname === STALKER_LINK_HOST && cmd
      ? { type: parsed.searchParams.get("type") === "vod" ? "vod" : "itv", cmd, series: parsed.searchParams.get("series") ?? "" }
      : null;
  } catch {
    return null;
  }
}

export function stalkerUserAgent(playlist: Pick<Playlist, "userAgent">): string {
  return playlist.userAgent?.trim() || STALKER_DEFAULT_USER_AGENT;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function records(value: unknown): Payload[] {
  return Array.isArray(value)
    ? value.filter((item): item is Payload => item !== null && typeof item === "object")
    : [];
}

async function deviceId(mac: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(mac));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function macOf(playlist: Playlist): string {
  const mac = normalizeMac(playlist.macAddress ?? "");
  if (!mac) throw new Error("Enter the portal's MAC address, for example 00:1A:79:12:34:56.");
  return mac;
}

// One login per source; a portal logs the box in again when its token stops working.

class PortalAuthError extends Error {}

// A portal answers a few requests at a time; asking for more gets a box throttled or logged out.
let activeRequests = 0;
const waiting: Array<() => void> = [];

async function gated<T>(work: () => Promise<T>): Promise<T> {
  if (activeRequests < MAX_PORTAL_REQUESTS) activeRequests += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve)); // the finishing request hands its slot over
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

function pause(millis: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("The operation was aborted.", "AbortError"));
    const timer = setTimeout(resolve, millis);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, { once: true });
  });
}

// Plain-text answers (with HTTP 200) that mean the session is not valid.
const AUTH_FAILURE = /authori[sz]ation|access denied|unauthori[sz]ed|not valid/i;

async function portalRequest(
  playlist: Playlist,
  params: Record<string, string>,
  token: string | null,
  signal?: AbortSignal,
  maxBytes = MAX_PORTAL_RESPONSE_BYTES,
): Promise<unknown> {
  const query = new URLSearchParams({ ...params, JsHttpRequest: "1-xml" });
  const headers: Record<string, string> = {
    Accept: "application/json, text/javascript, */*",
    Cookie: `mac=${macOf(playlist)}; stb_lang=en; timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    "X-User-Agent": STB_MODEL,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await gated(() => providerFetch(`${stalkerApiUrl(playlist.url)}?${query}`, { headers, signal }, stalkerUserAgent(playlist)));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      recordDiagnosticFailure("stalker-portal", "network");
      throw new Error(
        "The portal could not be reached. Stalker portals need the desktop app, and the portal address and your connection must be correct.",
        { cause: error },
      );
    }
    // Too many requests: wait as the portal asks (or a little longer each time) and try again.
    const delay = retryPolicy.delaysMillis[attempt];
    if ((response.status === 429 || response.status === 503) && delay !== undefined) {
      const asked = Number(response.headers.get("retry-after"));
      await pause(Number.isFinite(asked) && asked > 0 ? Math.min(asked * 1000, 30_000) : delay, signal);
      continue;
    }
    break;
  }
  if (response.status === 401 || response.status === 403) throw new PortalAuthError();
  if (!response.ok) {
    recordDiagnosticFailure("stalker-portal", "http", response.status);
    throw new Error(response.status === 429
      ? "The portal is limiting requests from this computer right now. Wait a few minutes and try again."
      : `The portal answered with HTTP ${response.status}.`);
  }
  const text = await readResponseText(response, maxBytes, "Portal response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Without a valid session many portals answer with a plain "Authorization failed." page.
    if (AUTH_FAILURE.test(text)) throw new PortalAuthError();
    recordDiagnosticFailure("stalker-portal", "invalid-response");
    throw new Error("The portal returned something TiviHub does not understand. Check the portal address.");
  }
  return (parsed as Payload | null)?.js ?? null;
}

interface Session {
  token: string;
  /** Seconds between keep-alive pings, as the portal asks. */
  watchdogSeconds: number;
}

async function login(playlist: Playlist, signal?: AbortSignal): Promise<Session> {
  const mac = macOf(playlist);
  const handshake = await portalRequest(playlist, { type: "stb", action: "handshake", token: "", prehash: "" }, null, signal);
  const token = stringValue((handshake as Payload | null)?.token);
  if (!token) throw new Error("The portal did not accept this MAC address.");

  const id = await deviceId(mac);
  const profileRequest = (secondStep: boolean) => portalRequest(playlist, {
    type: "stb",
    action: "get_profile",
    hd: "1",
    num_banks: "2",
    stb_type: "MAG250",
    client_type: "STB",
    image_version: "218",
    video_out: "hdmi",
    device_id: id,
    device_id2: id,
    sn: id.slice(0, 13),
    ...(secondStep ? { auth_second_step: "1" } : {}),
    hw_version: "1.7-BD-00",
    api_signature: "262",
    not_valid_token: "0",
  }, token, signal) as Promise<Payload | null>;

  // The profile says how the box stands: 0 is fine, 1 is blocked, 2 wants a login first.
  let profile = await profileRequest(false);
  if (numberValue(profile?.status) === 2) {
    if (!playlist.username.trim()) {
      throw new Error("This portal asks for a login. Add the username and password in the source's login settings.");
    }
    await portalRequest(playlist, {
      type: "stb",
      action: "do_auth",
      login: playlist.username.trim(),
      password: playlist.password,
      device_id: id,
      device_id2: id,
    }, token, signal);
    profile = await profileRequest(true);
  }
  const status = numberValue(profile?.status) ?? 0;
  if (status === 1) {
    throw new Error(stringValue(profile?.block_msg) ?? stringValue(profile?.msg) ?? "The portal has blocked this account.");
  }
  if (status === 2) throw new Error("The portal did not accept this login. Check the username and password with your provider.");
  const asked = numberValue(profile?.watchdog_timeout) ?? DEFAULT_WATCHDOG_SECONDS;
  return { token, watchdogSeconds: Math.min(3600, Math.max(30, asked)) };
}

const sessions = new Map<string, Promise<Session>>();

function session(playlist: Playlist, signal?: AbortSignal, renew = false): Promise<Session> {
  const key = `${playlist.id}|${playlist.url}|${playlist.macAddress}|${playlist.username}`;
  let current = renew ? undefined : sessions.get(key);
  if (!current) {
    current = login(playlist, signal);
    sessions.set(key, current);
    current.catch(() => sessions.delete(key));
  }
  return current;
}

/** A request inside a logged-in session; one expired token is replaced and the request repeated. */
async function call(
  playlist: Playlist,
  params: Record<string, string>,
  signal?: AbortSignal,
  maxBytes?: number,
): Promise<unknown> {
  try {
    return await portalRequest(playlist, params, (await session(playlist, signal)).token, signal, maxBytes);
  } catch (error) {
    if (!(error instanceof PortalAuthError)) throw error;
    try {
      return await portalRequest(playlist, params, (await session(playlist, signal, true)).token, signal, maxBytes);
    } catch (second) {
      if (second instanceof PortalAuthError) {
        throw new Error("The portal refused this MAC address or login. Check them with your provider.", { cause: second });
      }
      throw second;
    }
  }
}

function absolute(playlist: Playlist, value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  try {
    return new URL(text, playlist.url).toString();
  } catch {
    return undefined;
  }
}

export interface StalkerCatalog {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
}

/**
 * Most rows can be played from the address stored in `cmd` ("ffmpeg http://host/play/live.php?…"). A row
 * that says it does not need a temporary link (both flags present and off) is played that way, even when
 * the address is on the portal's own host: a fresh link from the portal is not always accepted by the
 * stream server, while the row's own address is. Anything else asks the portal when you press play.
 * Live rows ask for `extension=m3u8` instead of `ts`: the built-in player plays an HLS playlist, not a raw TS stream.
 */
function staticStreamUrl(item: Payload, cmd: string, live = false): string | null {
  const flags = [item.use_http_tmp_link, item.use_load_balancing];
  if (flags.every((flag) => flag === undefined) || flags.some((flag) => ["1", "true"].includes(String(flag)))) return null;
  const address = cmd.match(/https?:[/][/]\S+/)?.[0];
  if (!address) return null;
  try {
    const host = new URL(address).hostname;
    const local = host === "localhost" || host.startsWith("127.") || host === "[::1]" || host.endsWith(".local");
    if (local) return null;
    return live ? address.replace(/([?&]extension=)ts(?=&|$)/, "$1m3u8") : address;
  } catch {
    return null;
  }
}

export async function loadStalkerChannels(playlist: Playlist, signal?: AbortSignal): Promise<LiveChannel[]> {
  const genres = new Map(records(await call(playlist, { type: "itv", action: "get_genres" }, signal))
    .flatMap((genre) => {
      const id = stringValue(genre.id);
      const title = stringValue(genre.title);
      return id && title ? [[id, title] as const] : [];
    }));
  const response = await call(playlist, { type: "itv", action: "get_all_channels" }, signal) as Payload | null;
  return records(response?.data).flatMap((item) => {
    const id = stringValue(item.id);
    const name = stringValue(item.name);
    const cmd = stringValue(item.cmd);
    if (!id || !name || !cmd) return [];
    const group = genres.get(stringValue(item.tv_genre_id) ?? "") || "General";
    return [{
      id: `${playlist.id}:live:${id}`,
      playlistId: playlist.id,
      providerId: id,
      name,
      group,
      streamUrl: staticStreamUrl(item, cmd, true) ?? stalkerLink(cmd, "itv"),
      logoUrl: absolute(playlist, item.logo),
      ...(/\bradio\b/i.test(group) ? { radio: true } : {}),
    }];
  });
}

interface Category {
  id: string;
  title: string;
}

/** Category names by id for the video library or the series library; a portal without one answers with an error or nothing. */
async function categoryNames(playlist: Playlist, type: "vod" | "series", signal?: AbortSignal): Promise<Map<string, string>> {
  try {
    return new Map(records(await call(playlist, { type, action: "get_categories" }, signal)).flatMap((category) => {
      const id = stringValue(category.id);
      const title = stringValue(category.title);
      return id && id !== "*" && title ? [[id, title] as const] : [];
    }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return new Map();
  }
}

/** Episode numbers listed inline on an item, as older portals do (`series: [1, 2, 3]`). */
function inlineEpisodes(item: Payload): number[] {
  return Array.isArray(item.series)
    ? item.series.flatMap((value) => {
      const number = numberValue(value);
      return number !== undefined && number > 0 ? [number] : [];
    })
    : [];
}

function categoryOf(item: Payload, names: Map<string, string>, fallback: string): Category {
  const id = stringValue(item.category_id) ?? "";
  return { id, title: names.get(id) ?? fallback };
}

function movieFrom(playlist: Playlist, item: Payload, category: Category, id: string, name: string, cmd: string): Movie {
  // Ratings match a title by id or by name and year, so a missing year is filled in from the name.
  const year = catalogYear(item.year, name);
  const rating = numberValue(item.rating_imdb) ?? numberValue(item.rating_kinopoisk);
  // Portals keep local time as "2021-05-01 12:34:56"; the "Recently added" list sorts on it.
  const added = Date.parse(String(stringValue(item.added) ?? "").replace(" ", "T"));
  return {
    id: `${playlist.id}:movie:${id}`,
    playlistId: playlist.id,
    providerId: id,
    name,
    streamUrl: staticStreamUrl(item, cmd) ?? stalkerLink(cmd, "vod"),
    posterUrl: absolute(playlist, item.screenshot_uri),
    overview: stringValue(item.description),
    year,
    rating: rating && rating > 0 ? rating : undefined,
    imdbId: normalizeImdbId(item.imdb_id ?? item.imdb ?? item.imdbid),
    tmdbId: normalizeTmdbId(item.tmdb_id ?? item.tmdb),
    addedAtMillis: Number.isFinite(added) ? added : undefined,
    categoryId: category.id || undefined,
    category: category.title,
  };
}

function seriesFrom(playlist: Playlist, item: Payload, category: Category, providerId: string, name: string): Series {
  const movie = movieFrom(playlist, item, category, providerId, name, "");
  return {
    id: `${playlist.id}:series:${providerId}`,
    playlistId: playlist.id,
    providerId,
    name,
    posterUrl: movie.posterUrl,
    overview: movie.overview,
    seasons: 0,
    categoryId: movie.categoryId,
    category: category.title,
    year: movie.year,
    rating: movie.rating,
    imdbId: movie.imdbId,
    tmdbId: movie.tmdbId,
    addedAtMillis: movie.addedAtMillis,
  };
}

/** Portals answer 14 titles per request (their `max_page_items`); a screen batch asks for this many pages at once. */
const PAGES_PER_BATCH = 5;

/** The categories of the video library (`vod`) or the series library, for browsing. */
export async function loadStalkerTitleCategories(playlist: Playlist, type: "vod" | "series", signal?: AbortSignal): Promise<BrowseCategory[]> {
  return [...await categoryNames(playlist, type, signal)].map(([id, name]) => ({ id, name }));
}

/** How many titles a category holds: the portal says so on any page of it, so one small request is enough. */
export async function loadStalkerTitleCount(playlist: Playlist, type: "vod" | "series", categoryId: string, signal?: AbortSignal): Promise<number | undefined> {
  const response = await call(playlist, { type, action: "get_ordered_list", category: categoryId, p: "1", sortby: "added" }, signal) as Payload | null;
  return numberValue(response?.total_items);
}

export interface StalkerTitlesPage {
  movies: Movie[];
  series: Series[];
  /** The portal page to ask for next; absent on the last one. */
  nextPage?: number;
  total?: number;
}

/**
 * Titles of one category (null: all of them), newest first, read a few portal pages at a time. Portals keep series
 * in one of two ways: in the video library as an item with a list of episode numbers, or in a library of their own
 * with seasons and episodes opened one level at a time.
 */
export async function loadStalkerTitles(
  playlist: Playlist,
  type: "vod" | "series",
  categoryId: string | null,
  options: { page?: number; query?: string; sortByName?: boolean; categories?: BrowseCategory[] } = {},
  signal?: AbortSignal,
): Promise<StalkerTitlesPage> {
  const start = options.page ?? 1;
  const names = new Map((options.categories ?? []).map((category) => [category.id, category.name]));
  const params = (page: number) => ({
    type,
    action: "get_ordered_list",
    category: categoryId ?? "*",
    p: String(page),
    sortby: options.sortByName ? "name" : "added",
    ...(options.query?.trim() ? { search: options.query.trim() } : {}),
  });
  const pages = await Promise.all(Array.from({ length: PAGES_PER_BATCH }, (_, index) =>
    call(playlist, params(start + index), signal) as Promise<Payload | null>));
  const total = numberValue(pages[0]?.total_items);
  const perPage = numberValue(pages[0]?.max_page_items) ?? records(pages[0]?.data).length;
  const movies: Movie[] = [];
  const series: Series[] = [];
  const seen = new Set<string>();
  for (const item of pages.flatMap((page) => records(page?.data))) {
    const id = stringValue(item.id);
    const name = stringValue(item.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const category = categoryOf(item, names, type === "vod" ? "Movies" : "Series");
    if (type === "series") {
      series.push(seriesFrom(playlist, item, category, `series:${id}`, name));
      continue;
    }
    const cmd = stringValue(item.cmd);
    if (!cmd) continue;
    const episodes = inlineEpisodes(item);
    if (episodes.length > 0 || ["1", "true"].includes(String(item.is_series))) {
      series.push({ ...seriesFrom(playlist, item, category, `vod:${id}`, name), stalkerCmd: cmd, stalkerEpisodes: episodes });
    } else {
      movies.push(movieFrom(playlist, item, category, id, name, cmd));
    }
  }
  const last = start + PAGES_PER_BATCH - 1;
  const more = perPage > 0 && total !== undefined && last * perPage < total;
  return { movies, series, nextPage: more ? last + 1 : undefined, total };
}

/** What the app imports for a portal: the live channels. Movies and series are read per category while browsing. */
export async function loadStalkerCatalog(playlist: Playlist, signal?: AbortSignal): Promise<StalkerCatalog> {
  const channels = await loadStalkerChannels(playlist, signal);
  if (channels.length === 0) throw new Error("The portal returned no channels.");
  return { channels, movies: [], series: [] };
}

const SEASON_NAME = /season/i;
const MAX_EPISODE_PAGES = 50;

function digitsIn(value: unknown): number | undefined {
  const match = stringValue(value)?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

/** One level of a series: its seasons, or the episodes of a season. */
async function openSeriesLevel(
  playlist: Playlist,
  type: "vod" | "series",
  movieId: string,
  seasonId: string,
  signal?: AbortSignal,
): Promise<Payload[]> {
  const items: Payload[] = [];
  for (let page = 1; page <= MAX_EPISODE_PAGES; page += 1) {
    const response = await call(playlist, {
      type,
      action: "get_ordered_list",
      movie_id: movieId,
      season_id: seasonId,
      episode_id: "0",
      p: String(page),
    }, signal) as Payload | null;
    const data = records(response?.data);
    items.push(...data);
    const total = numberValue(response?.total_items) ?? 0;
    const perPage = numberValue(response?.max_page_items) ?? data.length;
    if (data.length === 0 || perPage <= 0 || items.length >= total) break;
  }
  return items;
}

/** The episodes of a series, read when it is opened. */
export async function loadStalkerEpisodes(playlist: Playlist, series: Series, signal?: AbortSignal): Promise<Episode[]> {
  const [model, id] = (series.providerId ?? "").split(/:(.*)/s);
  const episodes: Episode[] = [];
  const used = new Set<string>();
  const add = (season: number, number: number, name: string | undefined, cmd: string, item: Payload | null, linkSeries?: number) => {
    let key = `s${season}e${number}`;
    while (used.has(key)) key += "x";
    used.add(key);
    episodes.push({
      id: `${series.id}:${key}`,
      playlistId: playlist.id,
      providerId: stringValue(item?.id),
      seriesId: series.id,
      season,
      number,
      name: name ?? `Episode ${number}`,
      streamUrl: stalkerLink(cmd, "vod", linkSeries),
      overview: stringValue(item?.description),
      posterUrl: absolute(playlist, item?.screenshot_uri),
    });
  };

  const inline = series.stalkerEpisodes ?? [];
  if (model === "vod" && inline.length > 0) {
    if (!series.stalkerCmd) throw new Error("This series has no episode information from the portal.");
    for (const number of inline) add(1, number, undefined, series.stalkerCmd, null, number);
  } else if ((model === "vod" || model === "series") && id) {
    // Seasons and episodes are opened one level at a time: first the seasons, then the episodes of each.
    const type = model === "vod" ? "vod" : "series";
    const top = await openSeriesLevel(playlist, type, id, "0", signal);
    for (const [position, item] of top.entries()) {
      const isSeason = ["1", "true"].includes(String(item.is_season)) || SEASON_NAME.test(stringValue(item.name) ?? "");
      if (!isSeason) {
        // The portal lists episodes straight away.
        add(1, digitsIn(item.series_number ?? item.episode_num ?? item.name) ?? position + 1, stringValue(item.name), stringValue(item.cmd) ?? "", item);
        continue;
      }
      const season = numberValue(item.season_num ?? item.season_number) ?? digitsIn(item.name) ?? position + 1;
      const seasonId = stringValue(item.id) ?? "";
      const seasonCmd = stringValue(item.cmd);
      const numbers = inlineEpisodes(item);
      if (numbers.length > 0 && seasonCmd) {
        for (const number of numbers) add(season, number, undefined, seasonCmd, item, number);
        continue;
      }
      // Portals differ in which id names the season, so the second form is tried when the first is empty.
      let list = await openSeriesLevel(playlist, type, id, seasonId, signal);
      if (list.length === 0) list = await openSeriesLevel(playlist, type, seasonId, "0", signal);
      for (const [index, episode] of list.entries()) {
        const cmd = stringValue(episode.cmd) ?? seasonCmd;
        if (!cmd) continue;
        const number = numberValue(episode.series_number ?? episode.episode_num ?? episode.episode_number) ?? digitsIn(episode.name) ?? index + 1;
        const listed = inlineEpisodes(episode);
        if (listed.length > 0) for (const n of listed) add(season, n, undefined, cmd, episode, n);
        else add(season, number, stringValue(episode.name), cmd, episode);
      }
    }
  }
  if (episodes.length === 0) throw new Error("The portal returned no episodes for this series.");
  return episodes.sort((left, right) => left.season - right.season || left.number - right.number);
}

/** The next hours of programmes for every channel, in one request. */
export async function loadStalkerEpg(playlist: Playlist, signal?: AbortSignal): Promise<EpgProgram[]> {
  const response = await call(playlist, { type: "itv", action: "get_epg_info", period: String(EPG_PERIOD_HOURS) }, signal) as Payload | null;
  const data = response?.data;
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Payload).flatMap(([channelId, list]) =>
    records(list).flatMap((item) => {
      const start = numberValue(item.start_timestamp);
      const end = numberValue(item.stop_timestamp);
      const title = stringValue(item.name);
      if (!start || !end || !title || end <= start) return [];
      return [{
        id: `${playlist.id}:${channelId}:${start}`,
        channelId: `${playlist.id}:live:${channelId}`,
        title,
        synopsis: stringValue(item.descr),
        startMillis: start * 1000,
        endMillis: end * 1000,
        source: playlist.id,
      }];
    }));
}

/** Asks the portal for the address to play now; the address usually works for a short time only. */
export async function resolveStalkerLink(playlist: Playlist, link: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseLink(link);
  if (!parsed) throw new Error("This item has no portal address.");
  const response = await call(playlist, {
    type: parsed.type,
    action: "create_link",
    cmd: parsed.cmd,
    series: parsed.series,
    forced_storage: "",
    disable_ad: "0",
    download: "0",
    force_ch_link_check: "0",
  }, signal) as Payload | null;
  const cmd = stringValue(response?.cmd);
  // The reply looks like "ffmpeg http://host/stream?token=…": a player hint, then the address.
  const found = cmd?.match(/https?:\/\/\S+/)?.[0] ?? (cmd?.startsWith("/") ? new URL(cmd, playlist.url).toString() : undefined);
  if (!found) throw new Error("The portal did not give a stream address. Your subscription may not include this channel.");
  return found;
}

/**
 * Keeps the box logged in while a portal is open: Stalker portals expect a `get_events` ping every
 * couple of minutes (the interval comes from the profile). A failed ping is not retried and does not end the session.
 */
export function startStalkerKeepAlive(playlist: Playlist): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ping = async (first: boolean) => {
    let seconds = DEFAULT_WATCHDOG_SECONDS;
    try {
      seconds = (await session(playlist, controller.signal)).watchdogSeconds;
      await call(playlist, { type: "watchdog", action: "get_events", init: first ? "1" : "0", cur_play_type: "0", event_active_id: "0" }, controller.signal);
    } catch {
      // Not retried: the next ping is the retry.
    }
    if (!controller.signal.aborted) timer = setTimeout(() => void ping(false), seconds * 1000);
  };
  void ping(true);
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}

/** Logs the box in if it is not yet, so a stream address that belongs to the portal is asked for with a live session. */
export async function warmStalkerSession(playlist: Playlist): Promise<void> {
  await session(playlist);
}
