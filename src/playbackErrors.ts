interface PlaybackErrorDetails {
  code?: unknown;
  message?: unknown;
}

function isPlaybackErrorDetails(value: unknown): value is PlaybackErrorDetails {
  return typeof value === "object" && value !== null;
}

export function playbackErrorMessage(error: unknown): string {
  if (isPlaybackErrorDetails(error) && typeof error.code === "number") {
    if (error.code === 4032) {
      return "This stream isn't compatible with this device. Try another stream or device.";
    }
    if (error.code === 1003) {
      return "The stream is taking too long to respond. Check your connection and try again.";
    }
    if (error.code === 1001) {
      return "The provider couldn't open this stream. It may be unavailable or require you to sign in again.";
    }
    if (error.code === 1002) {
      return "Couldn't connect to this stream. Check your connection and try again.";
    }
    if (error.code === 1) return "Playback was interrupted. Try again.";
    if (error.code === 2) return "The stream was interrupted. Check your connection and try again.";
    if (error.code === 3) return "This video couldn't be decoded. Try another stream or device.";
    if (error.code === 4) return "This stream isn't supported by this device. Try another stream.";
  }
  return "Couldn't play this stream. Try again or choose another stream.";
}
