// Chromium-based web views count the audio and video they decode; other engines leave these out.
export interface DecodedMediaCounts {
  webkitAudioDecodedByteCount?: number;
  webkitVideoDecodedByteCount?: number;
}

/**
 * True when the picture is being decoded but not a single byte of sound. That is what a file with
 * AC-3, E-AC-3 or DTS audio looks like in a web view that has no decoder for it. An engine that does
 * not report the counts is never accused.
 */
export function soundIsMissing(video: object): boolean {
  const { webkitAudioDecodedByteCount: audio, webkitVideoDecodedByteCount: picture } = video as DecodedMediaCounts;
  return typeof audio === "number" && typeof picture === "number" && picture > 0 && audio === 0;
}
