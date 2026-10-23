export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
export const NATIVE_TRACK_EVENTS = ["addtrack", "removetrack", "change", "labelchange"] as const;

export interface TextTrackOption {
  id: number;
  label: string;
  language: string;
  active: boolean;
}

export interface ShakaTextTrack {
  id: number;
  label: string;
  language: string;
  active: boolean;
}

export interface ShakaVariantTrack {
  id: number;
  active: boolean;
  language: string;
  label?: string;
  audioId?: number;
  height?: number;
  bandwidth?: number;
}

export interface ShakaPlayer {
  attach(video: HTMLVideoElement): Promise<unknown>;
  addEventListener(type: string, listener: EventListener): void;
  configure(configuration: object): boolean;
  getNetworkingEngine(): {
    registerRequestFilter(filter: (type: number, request: { uris: string[] }) => void): void;
    registerResponseFilter(
      filter: (type: number, response: { uri: string; headers: Record<string, string> }) => void,
    ): void;
  } | null;
  load(uri: string): Promise<unknown>;
  retryStreaming(): void;
  getTextTracks(): ShakaTextTrack[];
  getVariantTracks(): ShakaVariantTrack[];
  selectTextTrack(track?: ShakaTextTrack | null): void;
  selectVariantTrack(track: ShakaVariantTrack, clearBuffer?: boolean, safeMargin?: number): void;
  addTextTrackAsync(
    uri: string,
    language: string,
    kind: string,
    mimeType?: string,
    codec?: string,
    label?: string,
    forced?: boolean,
  ): Promise<ShakaTextTrack>;
  destroy(): Promise<void>;
}

export interface ShakaRuntime {
  polyfill: { installAll(): void };
  Player: {
    new (): ShakaPlayer;
    isBrowserSupported(): boolean;
  };
}

export interface CastDeviceInfo {
  address: string;
  name: string;
}

export function mediaDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
}

export function directMediaUrl(value: string): boolean {
  try {
    return /\.(mp4|m4v|webm|mov|ogv|ogg)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function nativeHlsUrl(value: string, video: HTMLVideoElement): boolean {
  try {
    return /\.m3u8$/i.test(new URL(value).pathname) &&
      navigator.vendor === "Apple Computer, Inc." &&
      video.canPlayType("application/vnd.apple.mpegurl") !== "";
  } catch {
    return false;
  }
}

export function asWebVtt(contents: string): string {
  const normalized = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^\s*WEBVTT(?:\s|$)/i.test(normalized)) return normalized;
  const cues = normalized.replace(
    /^(\d{2}:\d{2}:\d{2}),(\d{3})(\s+-->\s+\d{2}:\d{2}:\d{2}),(\d{3})/gm,
    "$1.$2$3.$4",
  );
  return `WEBVTT\n\n${cues}`;
}
