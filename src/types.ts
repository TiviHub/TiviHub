export type PlaylistType = "M3U" | "XTREAM";
export type ContentType = "LIVE" | "MOVIE" | "SERIES" | "EPISODE";
export type LibraryStatus = "WATCHLIST" | "WATCHING" | "WATCHED";
export type DrmSystem = "com.widevine.alpha" | "com.apple.fps" | "com.apple.fps.1_0";

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  url: string;
  username: string;
  password: string;
  active: boolean;
  drmLicenseUrl: string;
  drmSystem: DrmSystem;
  drmCertificateUrl?: string;
  epgUrl?: string;
  fileName?: string;
  demo?: boolean;
  expiresAtMillis?: number;
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
  drmLicenseUrl?: string;
  drmSystem?: DrmSystem;
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
  addedAtMillis?: number;
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
  parentId?: string;
  parentTitle?: string;
}
