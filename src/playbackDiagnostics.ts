export type PlaybackPath = "Shaka Player" | "Native media element" | "Unknown";
export type NativeHlsSupport = "probably" | "maybe" | "no" | "unavailable";

export interface PlaybackDiagnosticError {
  code?: number;
  category?: number;
  httpStatus?: number;
}

export interface PlaybackDiagnosticFailure extends PlaybackDiagnosticError {
  path: PlaybackPath;
}

export interface BackendDiagnosticEvent {
  component: string;
  code: string;
}

export interface PlaybackDiagnosticSnapshot {
  appVersion: string;
  browser: string;
  failures: readonly PlaybackDiagnosticFailure[];
  drmConfigured: boolean;
  nativeHlsFallbackAttempted: boolean;
  mediaSourceAvailable: boolean;
  h264AacMp4Supported: boolean | null;
  h264AacMpegTsSupported: boolean | null;
  nativeHlsSupport: NativeHlsSupport;
  backendErrors: readonly BackendDiagnosticEvent[];
}

export function canUseNativeHlsFallback(value: string, support: NativeHlsSupport): boolean {
  if (support === "no" || support === "unavailable") return false;
  try {
    return /\.m3u8$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function playbackDiagnosticError(error: unknown): PlaybackDiagnosticError {
  if (typeof error !== "object" || error === null) return {};
  const value = error as { code?: unknown; category?: unknown; data?: unknown };
  const data = Array.isArray(value.data) ? value.data : [];
  const httpStatus = value.code === 1001 ? data[1] : undefined;
  return {
    ...(typeof value.code === "number" && Number.isSafeInteger(value.code) ? { code: value.code } : {}),
    ...(typeof value.category === "number" && Number.isSafeInteger(value.category)
      ? { category: value.category }
      : {}),
    ...(typeof httpStatus === "number" &&
      Number.isSafeInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
      ? { httpStatus }
      : {}),
  };
}

export function inspectPlaybackCapabilities(video: HTMLVideoElement | null) {
  const mediaSourceAvailable = typeof MediaSource !== "undefined" &&
    typeof MediaSource.isTypeSupported === "function";
  const nativeHls = video?.canPlayType("application/vnd.apple.mpegurl") ?? "";
  const nativeHlsSupport: NativeHlsSupport = !video
    ? "unavailable"
    : nativeHls === "probably" || nativeHls === "maybe"
      ? nativeHls
      : "no";

  return {
    mediaSourceAvailable,
    h264AacMp4Supported: mediaSourceAvailable
      ? MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
      : null,
    h264AacMpegTsSupported: mediaSourceAvailable
      ? MediaSource.isTypeSupported('video/mp2t; codecs="avc1.42E01E, mp4a.40.2"')
      : null,
    nativeHlsSupport,
  };
}

export function browserSummary(userAgent: string): string {
  const browserVersions: Array<[RegExp, string]> = [
    [/Edg(?:A|iOS)?\/(\d+)/, "Edge WebView2"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  for (const [pattern, name] of browserVersions) {
    const version = userAgent.match(pattern)?.[1];
    if (version) return `${name} ${version}`;
  }
  return "Unknown browser";
}

function supportedLabel(supported: boolean | null): string {
  if (supported === null) return "unavailable";
  return supported ? "yes" : "no";
}

function safeLabel(value: string, pattern: RegExp): string {
  return pattern.test(value) ? value : "unavailable";
}

function errorLabel(failure: PlaybackDiagnosticFailure): string {
  if (failure.path === "Shaka Player" && failure.code === 4032) {
    return "No compatible playback variant (Shaka 4032)";
  }
  if (failure.code === undefined) return "Unknown playback error";
  return `${failure.path} error ${failure.code}`;
}

export function createPlaybackDiagnosticReport(snapshot: PlaybackDiagnosticSnapshot): string {
  const failures = snapshot.failures.map((failure, index) => [
    `${index + 1}. ${errorLabel(failure)}`,
    ...(failure.category === undefined ? [] : [`   Category: ${failure.category}`]),
    ...(failure.httpStatus === undefined ? [] : [`   HTTP status: ${failure.httpStatus}`]),
  ].join("\n"));
  const backendErrors = snapshot.backendErrors.flatMap((event) => {
    const component = safeLabel(event.component, /^[a-z][a-z0-9_-]{0,31}$/i);
    const code = safeLabel(event.code, /^[A-Z][A-Z0-9_]{0,47}$/);
    return component === "unavailable" || code === "unavailable"
      ? []
      : [`- ${component}: ${code}`];
  });

  return [
    "TiviHub Playback Diagnostic Report",
    `App version: ${safeLabel(snapshot.appVersion, /^[A-Za-z0-9.+_-]{1,40}$/)}`,
    `Browser: ${safeLabel(snapshot.browser, /^[A-Za-z0-9 ._-]{1,80}$/)}`,
    `DRM configured: ${snapshot.drmConfigured ? "yes" : "no"}`,
    `Native HLS fallback attempted: ${snapshot.nativeHlsFallbackAttempted ? "yes" : "no"}`,
    `Media Source Extensions available: ${snapshot.mediaSourceAvailable ? "yes" : "no"}`,
    `MSE H.264/AAC MP4 support: ${supportedLabel(snapshot.h264AacMp4Supported)}`,
    `MSE H.264/AAC MPEG-TS support: ${supportedLabel(snapshot.h264AacMpegTsSupported)}`,
    `Native HLS support: ${snapshot.nativeHlsSupport}`,
    "Playback errors:",
    ...(failures.length ? failures : ["None recorded."]),
    "Backend errors:",
    ...(backendErrors.length ? backendErrors : ["None recorded in this app session."]),
    "Media titles, provider names, stream/license URLs, credentials, raw error messages, and stack traces are omitted.",
  ].join("\n");
}
