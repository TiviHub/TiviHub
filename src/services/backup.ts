import { t } from "../lib/i18n";
import type { UserDataSnapshot } from "../types";

const BACKUP_FORMAT = "tivihub-web-backup";
const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error(t("bk.damagedEncoding"));
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(snapshot: UserDataSnapshot, password: string): Promise<string> {
  if (password.length < 12) throw new Error(t("bk.passwordShort"));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(snapshot));
  if (plaintext.byteLength > MAX_BACKUP_BYTES) throw new Error(t("bk.dataTooLarge"));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const backup: EncryptedBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  const serialized = JSON.stringify(backup);
  if (encoder.encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new Error(t("bk.encryptedTooLarge"));
  }
  return serialized;
}

export async function decryptBackup(contents: string, password: string): Promise<UserDataSnapshot> {
  if (encoder.encode(contents).byteLength > MAX_BACKUP_BYTES) {
    throw new Error(t("settings.backup.tooLarge"));
  }
  let backup: Partial<EncryptedBackup>;
  try {
    backup = JSON.parse(contents) as Partial<EncryptedBackup>;
  } catch {
    throw new Error(t("bk.notValid"));
  }
  if (
    backup.format !== BACKUP_FORMAT ||
    backup.version !== BACKUP_VERSION ||
    backup.kdf !== "PBKDF2-SHA-256" ||
    backup.cipher !== "AES-256-GCM" ||
    backup.iterations !== PBKDF2_ITERATIONS ||
    typeof backup.salt !== "string" ||
    typeof backup.iv !== "string" ||
    typeof backup.ciphertext !== "string"
  ) {
    throw new Error(t("bk.formatUnsupported"));
  }

  const salt = fromBase64(backup.salt);
  const iv = fromBase64(backup.iv);
  const ciphertext = fromBase64(backup.ciphertext);
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
    throw new Error(t("bk.damagedCrypto"));
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await deriveKey(password, salt),
      ciphertext,
    );
  } catch {
    throw new Error(t("bk.decryptFailed"));
  }

  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error(t("bk.decryptedInvalid"));
  }
  return validateSnapshot(value);
}

function validateSnapshot(value: unknown): UserDataSnapshot {
  if (!value || typeof value !== "object") throw new Error(t("bk.structure"));
  const snapshot = value as Partial<UserDataSnapshot>;
  const arrayFields: (keyof UserDataSnapshot)[] = [
    "playlists",
    "documents",
    "channels",
    "movies",
    "series",
    "episodes",
    "favorites",
    "library",
    "epg",
  ];
  if (
    snapshot.version !== 1 ||
    !Number.isFinite(snapshot.exportedAt) ||
    !arrayFields.every((field) => Array.isArray(snapshot[field])) ||
    typeof snapshot.openSubtitlesApiKey !== "string" ||
    snapshot.openSubtitlesApiKey.length > 10_000 ||
    !["system", "light", "dark"].includes(snapshot.theme ?? "") ||
    (snapshot.showAdultContent !== undefined && typeof snapshot.showAdultContent !== "boolean")
  ) {
    throw new Error(t("bk.incomplete"));
  }
  const playlists = snapshot.playlists as unknown[];
  const documents = snapshot.documents as unknown[];
  const channels = snapshot.channels as unknown[];
  const movies = snapshot.movies as unknown[];
  const series = snapshot.series as unknown[];
  const episodes = snapshot.episodes as unknown[];
  const favorites = snapshot.favorites as unknown[];
  const library = snapshot.library as unknown[];
  const epg = snapshot.epg as unknown[];

  if (!playlists.every(isRecord) || !channels.every(isRecord) || !movies.every(isRecord) ||
      !series.every(isRecord) || !episodes.every(isRecord) || !favorites.every(isRecord) ||
      !library.every(isRecord) || !epg.every(isRecord) || !documents.every(isRecord)) {
    throw new Error(t("bk.invalidRecord"));
  }

  const playlistIds = new Set<string>();
  for (const playlist of playlists) {
    if (
      !validId(playlist.id) ||
      playlistIds.has(playlist.id) ||
      !validText(playlist.name, 80) ||
      !["M3U", "XTREAM", "STALKER"].includes(String(playlist.type)) ||
      typeof playlist.url !== "string" ||
      playlist.url.length > 8192 ||
      (playlist.url !== "" && !isHttpUrl(playlist.url)) ||
      (playlist.type !== "M3U" && !isHttpUrl(playlist.url)) ||
      !validMac(playlist.macAddress, playlist.type === "STALKER") ||
      !validText(playlist.username, 4096, true) ||
      !validText(playlist.password, 4096, true) ||
      typeof playlist.active !== "boolean" ||
      !Number.isFinite(playlist.createdAt) ||
      typeof playlist.drmLicenseUrl !== "string" ||
      !optionalSecureUrl(playlist.drmLicenseUrl) ||
      !isDrmSystem(playlist.drmSystem) ||
      !optionalSecureUrl(playlist.drmCertificateUrl) ||
      !optionalHttpUrl(playlist.epgUrl) ||
      !optionalText(playlist.fileName, 255) ||
      !optionalFinite(playlist.expiresAtMillis) ||
      !optionalText(playlist.serverTimeZone, 64) ||
      !validUserAgent(playlist.userAgent) ||
      !optionalFinite(playlist.lastCatalogRefreshAt)
    ) {
      throw new Error(t("bk.invalidPlaylist"));
    }
    playlistIds.add(playlist.id);
  }
  if (playlists.filter((playlist) => playlist.active === true).length > 1) {
    throw new Error(t("bk.multipleActive"));
  }

  const documentIds = new Set<string>();
  for (const document of documents) {
    if (
      !validId(document.playlistId) ||
      !playlistIds.has(document.playlistId) ||
      documentIds.has(document.playlistId) ||
      typeof document.content !== "string"
    ) {
      throw new Error(t("bk.invalidFile"));
    }
    documentIds.add(document.playlistId);
  }

  validateCatalogRecords(channels, playlistIds, "channel");
  validateCatalogRecords(movies, playlistIds, "movie");
  const seriesIds = validateCatalogRecords(series, playlistIds, "series");
  const episodeIds = new Set<string>();
  for (const episode of episodes) {
    if (
      !validId(episode.id) ||
      episodeIds.has(String(episode.id)) ||
      !validId(episode.playlistId) ||
      !playlistIds.has(episode.playlistId) ||
      !validId(episode.seriesId) ||
      !seriesIds.has(episode.seriesId) ||
      !validText(episode.name, 2048) ||
      !isHttpUrl(episode.streamUrl) ||
      !nonNegativeFinite(episode.season) ||
      !nonNegativeFinite(episode.number) ||
      !optionalText(episode.overview, 20_000) ||
      !optionalHttpUrl(episode.posterUrl) ||
      !optionalSecureUrl(episode.drmLicenseUrl) ||
      !optionalDrmSystem(episode.drmSystem)
    ) {
      throw new Error(t("bk.invalidEpisode"));
    }
    episodeIds.add(String(episode.id));
  }
  const favoriteIds = new Set<string>();
  for (const favorite of favorites) {
    if (
      !validId(favorite.id) ||
      favoriteIds.has(String(favorite.id)) ||
      !validId(favorite.playlistId) ||
      !playlistIds.has(favorite.playlistId) ||
      !validId(favorite.contentId) ||
      !validText(favorite.title, 2048) ||
      !["LIVE", "MOVIE", "SERIES", "EPISODE"].includes(String(favorite.contentType)) ||
      !optionalHttpUrl(favorite.streamUrl) ||
      !optionalHttpUrl(favorite.artworkUrl) ||
      !optionalSecureUrl(favorite.drmLicenseUrl) ||
      !optionalDrmSystem(favorite.drmSystem) ||
      !Number.isFinite(favorite.addedAt)
    ) {
      throw new Error(t("bk.invalidFavorite"));
    }
    favoriteIds.add(String(favorite.id));
  }
  const libraryIds = new Set<string>();
  for (const item of library) {
    if (
      !validId(item.id) ||
      libraryIds.has(String(item.id)) ||
      !validId(item.playlistId) ||
      !playlistIds.has(item.playlistId) ||
      !validId(item.contentId) ||
      !validText(item.title, 2048) ||
      !["LIVE", "MOVIE", "SERIES", "EPISODE"].includes(String(item.contentType)) ||
      !["WATCHLIST", "WATCHING", "WATCHED"].includes(String(item.status)) ||
      !optionalHttpUrl(item.streamUrl) ||
      !optionalHttpUrl(item.artworkUrl) ||
      !optionalSecureUrl(item.drmLicenseUrl) ||
      !optionalDrmSystem(item.drmSystem) ||
      !nonNegativeFinite(item.positionMillis) ||
      !nonNegativeFinite(item.durationMillis) ||
      !optionalText(item.parentId, 512) ||
      !optionalText(item.parentTitle, 2048) ||
      !Number.isFinite(item.updatedAt)
    ) {
      throw new Error(t("bk.invalidLibrary"));
    }
    libraryIds.add(String(item.id));
  }
  const epgIds = new Set<string>();
  for (const program of epg) {
    if (
      !validId(program.id) ||
      epgIds.has(String(program.id)) ||
      !validId(program.channelId) ||
      !validId(program.source) ||
      !playlistIds.has(program.source) ||
      !validText(program.title, 2048) ||
      !optionalText(program.synopsis, 20_000) ||
      !finiteNumber(program.startMillis) ||
      !finiteNumber(program.endMillis) ||
      program.startMillis >= program.endMillis
    ) {
      throw new Error(t("bk.invalidProgramme"));
    }
    epgIds.add(String(program.id));
  }
  return snapshot as UserDataSnapshot;
}

function validMac(value: unknown, required: boolean): boolean {
  if (value === undefined) return !required;
  return typeof value === "string" && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value);
}

function validUserAgent(value: unknown): boolean {
  // eslint-disable-next-line no-control-regex -- control characters must not reach a header
  return value === undefined || (typeof value === "string" && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function validText(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maxLength && (allowEmpty || value.trim().length > 0);
}

function optionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || validText(value, maxLength, true);
}

function optionalFinite(value: unknown): boolean {
  return value === undefined || finiteNumber(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

function optionalHttpUrl(value: unknown): boolean {
  return value === undefined || (value === "" || isHttpUrl(value));
}

function optionalSecureUrl(value: unknown): boolean {
  return value === undefined || value === "" ||
    (typeof value === "string" && isHttpUrl(value) && value.startsWith("https://"));
}

function isDrmSystem(value: unknown): boolean {
  return value === "com.widevine.alpha" || value === "com.apple.fps" || value === "com.apple.fps.1_0";
}

function optionalDrmSystem(value: unknown): boolean {
  return value === undefined || isDrmSystem(value);
}

function validateCatalogRecords(
  records: Record<string, unknown>[],
  playlistIds: Set<string>,
  kind: "channel" | "movie" | "series",
): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    const commonInvalid =
      !validId(record.id) ||
      ids.has(String(record.id)) ||
      !validId(record.playlistId) ||
      !playlistIds.has(String(record.playlistId)) ||
      !validText(record.name, 2048) ||
      !optionalText(record.providerId, 512) ||
      !optionalHttpUrl(record.posterUrl) ||
      !optionalText(record.overview, 20_000) ||
      !optionalText(record.categoryId, 512) ||
      !optionalText(record.category, 512) ||
      !optionalFinite(record.year) ||
      !optionalFinite(record.rating) ||
      !optionalFinite(record.addedAtMillis);
    const kindInvalid = kind === "channel"
      ? !validText(record.group, 512) ||
        !isHttpUrl(record.streamUrl) ||
        !optionalHttpUrl(record.logoUrl) ||
        !optionalText(record.tvgId, 512) ||
        !optionalSecureUrl(record.drmLicenseUrl) ||
        !optionalDrmSystem(record.drmSystem)
      : kind === "movie"
        ? !isHttpUrl(record.streamUrl) ||
          !optionalSecureUrl(record.drmLicenseUrl) ||
          !optionalDrmSystem(record.drmSystem)
        : !nonNegativeFinite(record.seasons);
    if (commonInvalid || kindInvalid) throw new Error(t(kind === "channel" ? "bk.invalidChannel" : kind === "movie" ? "bk.invalidMovie" : "bk.invalidSeries"));
    ids.add(String(record.id));
  }
  return ids;
}
