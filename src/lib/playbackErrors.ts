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
    if (error.code === 6018 || error.code === 6019) {
      return "This stream requires display protection that this device or display can't provide. Try another device or display.";
    }
    if (error.code >= 6000 && error.code <= 6020) {
      return "This protected stream couldn't be authorized. Check the provider's DRM requirements and source settings, then try again.";
    }
    if (error.code === 4032) {
      return "This stream isn't compatible with this device. Try another stream or device.";
    }
    if (error.code === 1003) {
      return "The stream is taking too long to respond. Check your connection and try again.";
    }
    if (error.code === 1001) {
      if (Array.isArray(error.data) && error.data[1] === 509) {
        return "The stream server is temporarily limiting requests. Wait a moment and try again.";
      }
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
