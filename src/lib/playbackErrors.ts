import { t } from "./i18n";

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
      return t("play.pbDisplayProtection");
    }
    if (error.code >= 6000 && error.code <= 6020) {
      return t("play.pbDrm");
    }
    if (error.code === 4032) {
      return t("play.pbIncompatible");
    }
    if (error.code === 1003) {
      return t("play.pbSlow");
    }
    if (error.code === 1001) {
      if (Array.isArray(error.data) && error.data[1] === 509) {
        return t("play.pbLimited");
      }
      return t("play.pbOpen");
    }
    if (error.code === 1002) {
      return t("play.pbConnect");
    }
    if (error.code === 1) return t("play.pbInterrupted");
    if (error.code === 2) return t("play.pbStreamInterrupted");
    if (error.code === 3) return t("play.pbDecode");
    if (error.code === 4) return t("play.pbUnsupported");
  }
  return t("play.pbGeneric");
}
