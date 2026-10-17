interface PlaybackErrorDetails {
  code?: unknown;
  data?: unknown;
  message?: unknown;
}

function isPlaybackErrorDetails(value: unknown): value is PlaybackErrorDetails {
  return typeof value === "object" && value !== null;
}

export function playbackErrorMessage(error: unknown): string {
  if (isPlaybackErrorDetails(error) && typeof error.code === "number") {
    if (error.code === 1003) {
      return "A request to the media source timed out before it responded. Check your connection and try again. If it keeps happening, the stream may be slow or unavailable from the provider.";
    }
    if (error.code === 1001) {
      return "The media server returned an unsuccessful response. The stream may be unavailable, expired, or require authorization.";
    }
    if (error.code === 1002) {
      return "The media request failed before a response was received. Check network access and whether the provider allows playback from this app.";
    }
    if (typeof error.message === "string" && error.message.trim()) return error.message;
  }
  if (error instanceof Error) return error.message;
  if (isPlaybackErrorDetails(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  if (isPlaybackErrorDetails(error) && typeof error.code === "number") {
    return `Playback failed (error code ${error.code}).`;
  }
  return "Playback could not be started.";
}
