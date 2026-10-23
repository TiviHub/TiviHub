import { invoke, isTauri } from "@tauri-apps/api/core";

/** Opening a stream in VLC or mpv is a desktop feature; the browser build has no program to start. */
export function canOpenExternally(): boolean {
  return isTauri();
}

/** Starts VLC or mpv with the address and returns the name of the program that was started. */
export function openInExternalPlayer(url: string, userAgent?: string): Promise<string> {
  return invoke<string>("open_in_external_player", { url, userAgent });
}
