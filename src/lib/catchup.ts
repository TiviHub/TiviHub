import { xtreamTimeshiftUrl } from "../providers/xtream";
import type { CatchupMode, ChannelCatchup, EpgProgram, LiveChannel, Playlist } from "../types";

const DAY_MILLIS = 86_400_000;
const PLACEHOLDER = /\$?\{(start|end|timestamp|duration|offset|utc|utcend|lutc)\}/g;

const MODES: Record<string, CatchupMode> = {
  default: "default",
  append: "append",
  shift: "shift",
  flussonic: "flussonic",
  "flussonic-hls": "flussonic",
  "flussonic-ts": "flussonic",
  fs: "flussonic",
};

/** Reads the `catchup*` attributes of an #EXTINF line. */
export function catchupFromAttributes(attributes: Record<string, string>): ChannelCatchup | undefined {
  const source = attributes["catchup-source"]?.trim() || undefined;
  const declared = (attributes.catchup || attributes["catchup-type"] || "").trim().toLowerCase();
  const mode = MODES[declared] ?? (source ? "default" : undefined);
  if (!mode || (mode !== "shift" && mode !== "flussonic" && !source)) return undefined;
  const days = Number(attributes["catchup-days"] || attributes["tvg-rec"] || 1);
  return { mode, days: Number.isFinite(days) && days > 0 ? days : 1, source };
}

function withinWindow(channel: LiveChannel, startMillis: number, now: number): boolean {
  const days = channel.catchup?.days;
  return Boolean(days) && startMillis >= now - days! * DAY_MILLIS;
}

/** A finished programme that the provider still has a recording of. */
export function canReplay(channel: LiveChannel, program: EpgProgram, now = Date.now()): boolean {
  return program.endMillis <= now && withinWindow(channel, program.startMillis, now);
}

/** The programme on air now, which can be watched again from its beginning. */
export function canStartOver(channel: LiveChannel, program: EpgProgram, now = Date.now()): boolean {
  return program.startMillis <= now && now < program.endMillis && withinWindow(channel, program.startMillis, now);
}

function fill(template: string, startMillis: number, endMillis: number, now: number): string {
  const start = Math.floor(startMillis / 1000);
  const end = Math.floor(endMillis / 1000);
  const values: Record<string, number> = {
    start,
    utc: start,
    end,
    utcend: end,
    timestamp: Math.floor(now / 1000),
    lutc: Math.floor(now / 1000),
    duration: end - start,
    offset: Math.floor(now / 1000) - start,
  };
  return template.replace(PLACEHOLDER, (_match, name: string) => String(values[name]));
}

function appendQuery(url: string, query: string): string {
  const trimmed = query.replace(/^[?&]/, "");
  return `${url}${url.includes("?") ? "&" : "?"}${trimmed}`;
}

/** The address of a recorded programme, or null when this channel cannot be replayed from this source. */
export function replayUrl(
  channel: LiveChannel,
  playlist: Playlist,
  startMillis: number,
  endMillis: number,
  now = Date.now(),
): string | null {
  const catchup = channel.catchup;
  if (!catchup) return null;
  if (catchup.mode === "xtream") {
    return channel.providerId
      ? xtreamTimeshiftUrl(playlist, channel.providerId, startMillis, endMillis)
      : null;
  }
  const source = catchup.source ? fill(catchup.source, startMillis, endMillis, now) : undefined;
  switch (catchup.mode) {
    case "default":
      return source ?? null;
    case "append":
      return source ? appendQuery(channel.streamUrl, source) : null;
    case "shift":
      return appendQuery(channel.streamUrl, fill("utc={utc}&lutc={lutc}", startMillis, endMillis, now));
    case "flussonic": {
      const base = channel.streamUrl.split("?")[0];
      const directory = base.slice(0, base.lastIndexOf("/") + 1);
      const extension = base.endsWith(".m3u8") ? "m3u8" : "ts";
      return `${directory}${fill("archive-{utc}-{duration}", startMillis, endMillis, now)}.${extension}`;
    }
  }
}
