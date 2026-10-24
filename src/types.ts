export type PlaylistType = "M3U" | "XTREAM" | "STALKER";
export type ContentType = "LIVE" | "MOVIE" | "SERIES" | "EPISODE";
export type LibraryStatus = "WATCHLIST" | "WATCHING" | "WATCHED";
export type DrmSystem = "com.widevine.alpha" | "com.apple.fps" | "com.apple.fps.1_0";
export type CatalogRefreshOutcome = "success" | "review-required" | "kept-previous" | "failed";

export interface CatalogChangeCount {
  added: number;
  removed: number;
}

export interface CatalogChangeSummary {
  channels: CatalogChangeCount;
  movies: CatalogChangeCount;
  series: CatalogChangeCount;
  episodes?: CatalogChangeCount;
}

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  url: string;
  username: string;
  password: string;
  /** Stalker portals identify the account by the MAC address of a set-top box. Sealed like the password. */
  macAddress?: string;
  active: boolean;
  drmLicenseUrl: string;
  drmSystem: DrmSystem;
  drmCertificateUrl?: string;
  epgUrl?: string;
  /** Sent instead of the default User-Agent on every request for this source (desktop app only). */
  userAgent?: string;
  fileName?: string;
  demo?: boolean;
  /** Set by the SQLite migration when saved credentials could not be decrypted and must be entered again. */
  needsReentry?: boolean;
  expiresAtMillis?: number;
  /** IANA time zone the Xtream server reported; replay times are written in it. */
  serverTimeZone?: string;
  lastCatalogRefreshAt?: number;
  lastCatalogRefreshAttemptAt?: number;
  lastCatalogRefreshOutcome?: CatalogRefreshOutcome;
  lastCatalogRefreshSummary?: CatalogChangeSummary;
  createdAt: number;
}

export interface LiveChannel {
  id: string;
  playlistId: string;
  providerId?: string;
  name: string;
  group: string;
  streamUrl: string;
  logoUrl?: string;
  tvgId?: string;
  /** An audio station: played without a video picture and listed under the Radio filter. */
  radio?: boolean;
  /** Present when the provider keeps a recording of this channel for replay. */
  catchup?: ChannelCatchup;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
}

export type CatchupMode = "xtream" | "default" | "append" | "shift" | "flussonic";

export interface ChannelCatchup {
  mode: CatchupMode;
  /** How many days back the provider keeps recordings. */
  days: number;
  /** URL template from the playlist's `catchup-source`, for the template modes. */
  source?: string;
}

export interface Movie {
  id: string;
  playlistId: string;
  providerId?: string;
  name: string;
  streamUrl: string;
  posterUrl?: string;
  overview?: string;
  year?: number;
  rating?: number;
  imdbId?: string;
  tmdbId?: string;
  categoryId?: string;
  category?: string;
  addedAtMillis?: number;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
}

export interface Series {
  id: string;
  playlistId: string;
  providerId?: string;
  name: string;
  posterUrl?: string;
  overview?: string;
  seasons: number;
  categoryId?: string;
  category?: string;
  year?: number;
  rating?: number;
  imdbId?: string;
  tmdbId?: string;
  addedAtMillis?: number;
  /** Stalker portals: the command and episode numbers kept with a series listed in the video library. */
  stalkerCmd?: string;
  stalkerEpisodes?: number[];
}

export interface Episode {
  id: string;
  playlistId: string;
  providerId?: string;
  seriesId: string;
  season: number;
  number: number;
  name: string;
  streamUrl: string;
  overview?: string;
  posterUrl?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
}

export interface Favorite {
  id: string;
  contentId: string;
  contentType: ContentType;
  title: string;
  playlistId: string;
  streamUrl?: string;
  artworkUrl?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
  addedAt: number;
}

export interface LibraryItem {
  id: string;
  contentId: string;
  contentType: ContentType;
  playlistId: string;
  title: string;
  streamUrl?: string;
  artworkUrl?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
  status: LibraryStatus;
  positionMillis: number;
  durationMillis: number;
  parentId?: string;
  parentTitle?: string;
  updatedAt: number;
}

export interface EpgProgram {
  id: string;
  channelId: string;
  title: string;
  synopsis?: string;
  startMillis: number;
  endMillis: number;
  source: string;
}

/** A TV guide programme the person wants to be told about shortly before it starts. */
export interface Reminder {
  id: string;
  playlistId: string;
  channelId: string;
  channelName: string;
  title: string;
  startMillis: number;
}

export interface PlaylistDocument {
  playlistId: string;
  content: string;
}

export interface UserDataSnapshot {
  version: 1;
  exportedAt: number;
  playlists: Playlist[];
  documents: PlaylistDocument[];
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
  favorites: Favorite[];
  library: LibraryItem[];
  epg: EpgProgram[];
  openSubtitlesApiKey: string;
  theme: "system" | "light" | "dark";
  showAdultContent?: boolean;
}

export type CatalogContent = LiveChannel | Movie | Episode;

export interface PlayableItem {
  id: string;
  playlistId: string;
  contentType: ContentType;
  title: string;
  streamUrl: string;
  artworkUrl?: string;
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
  drmCertificateUrl?: string;
  live: boolean;
  /** The address kept in the catalog when `streamUrl` was resolved just before playing (Stalker portals). */
  sourceUrl?: string;
  /** Load the address as a plain media file, without asking the server what it is first. */
  direct?: boolean;
  radio?: boolean;
  /** The source's custom User-Agent; the player sends it through the desktop proxy. */
  userAgent?: string;
  /** A recorded programme of a live channel: seekable, but not saved to the library. */
  replay?: boolean;
  offline?: boolean;
  parentId?: string;
  parentTitle?: string;
}

export type RatingsMediaType = "MOVIE" | "SERIES";

export interface ExternalRating {
  source: string;
  /** Original value from the source, on the source's own scale. */
  value?: number;
  /** Source score normalised by MDBList to 0-100. */
  score?: number;
  votes?: number;
}

export interface ExternalRatings {
  ratings: ExternalRating[];
  overview?: string;
  ids?: { imdb?: string; tmdb?: string };
}

export interface RatingsCacheEntry {
  key: string;
  mediaType: RatingsMediaType;
  externalIds?: { imdb?: string; tmdb?: string };
  title: string;
  year?: number;
  ratings?: ExternalRatings;
  fetchedAt: number;
  expiresAt: number;
  notFound?: boolean;
}

export interface MdblistPopularItem {
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
}

export interface MdblistPopularCacheEntry {
  key: string;
  mediaType: RatingsMediaType;
  items: MdblistPopularItem[];
  fetchedAt: number;
  expiresAt: number;
}

/** The last answer for one Xtream live category, shown at once on the next visit while a fresh one loads. */
export interface LiveCategoryCacheEntry {
  key: string;
  playlistId: string;
  channels: LiveChannel[];
  /** Movie categories reuse this store: the movies of one category go here instead of `channels`. */
  movies?: Movie[];
  /** Same for series. */
  series?: Series[];
  /** Set on the entry that holds a source's category list instead of one category's channels. */
  categories?: { id: string; name: string; count?: number }[];
  savedAt: number;
}

export interface MdblistRateLimitState {
  key: string;
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterUntil?: number;
}

export interface OpenSubtitleSearchResult {
  fileId: number;
  fileName: string;
  language: string;
  release?: string;
  downloadCount: number;
}

export interface OpenSubtitleSearchCacheEntry {
  key: string;
  results: OpenSubtitleSearchResult[];
  fetchedAt: number;
  expiresAt: number;
}

/** Every subtitle file downloaded for one movie or episode, oldest first. */
export interface OpenSubtitleChoices {
  itemId: string;
  fileIds: number[];
}

export interface OpenSubtitleFileCacheEntry {
  fileId: number;
  name: string;
  contents: string;
  fetchedAt: number;
  expiresAt: number;
}
