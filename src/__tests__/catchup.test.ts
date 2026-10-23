import { describe, expect, it } from "vitest";
import { canReplay, canStartOver, catchupFromAttributes, replayUrl } from "../catchup";
import { parseM3uCatalog } from "../providers/m3u";
import { formatServerTime } from "../serverTime";
import type { EpgProgram, LiveChannel, Playlist } from "../types";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 23, 18, 0, 0);

const playlist: Playlist = {
  id: "p", name: "P", type: "XTREAM", url: "https://panel.example:8080", username: "user", password: "pa ss",
  active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 0, serverTimeZone: "Europe/Amsterdam",
};
const channel = (catchup: LiveChannel["catchup"], streamUrl = "https://host/live/1.m3u8"): LiveChannel => ({
  id: "c", playlistId: "p", providerId: "77", name: "One", group: "News", streamUrl, catchup,
});
const program = (startOffsetHours: number, hours = 1): EpgProgram => ({
  id: "e", channelId: "c", title: "News", source: "p",
  startMillis: now + startOffsetHours * HOUR, endMillis: now + (startOffsetHours + hours) * HOUR,
});

describe("replay availability", () => {
  it("allows a finished programme inside the archive window only", () => {
    const one = channel({ mode: "xtream", days: 2 });
    expect(canReplay(one, program(-3), now)).toBe(true);
    expect(canReplay(one, program(-49), now)).toBe(false);
    expect(canReplay(one, program(1), now)).toBe(false);
    expect(canReplay(channel(undefined), program(-3), now)).toBe(false);
  });

  it("offers start over for the programme on air", () => {
    const one = channel({ mode: "xtream", days: 1 });
    expect(canStartOver(one, program(-0.5), now)).toBe(true);
    expect(canStartOver(one, program(-3), now)).toBe(false);
    expect(canReplay(one, program(-0.5), now)).toBe(false);
  });
});

describe("server time", () => {
  it("writes the start in the server's time zone", () => {
    const start = Date.UTC(2026, 9, 23, 18, 5, 0);
    expect(formatServerTime(start, "Europe/Amsterdam")).toBe("2026-10-23:20-05");
    expect(formatServerTime(start, "UTC")).toBe("2026-10-23:18-05");
  });

  it("falls back to the device time zone when the server name is unknown", () => {
    expect(formatServerTime(now, "Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/);
  });
});

describe("replay URLs", () => {
  const start = Date.UTC(2026, 9, 23, 16, 0, 0);
  const end = start + 90 * 60_000;

  it("builds an Xtream timeshift address with the duration in minutes", () => {
    expect(replayUrl(channel({ mode: "xtream", days: 3 }), playlist, start, end, now))
      .toBe("https://panel.example:8080/timeshift/user/pa%20ss/90/2026-10-23:18-00/77.m3u8");
  });

  it("fills the placeholders of a catchup-source template", () => {
    const url = replayUrl(
      channel({ mode: "default", days: 3, source: "https://host/arch/1.m3u8?s=${start}&e=${end}&d=${duration}&o=${offset}" }),
      playlist, start, end, now,
    );
    expect(url).toBe(`https://host/arch/1.m3u8?s=${start / 1000}&e=${end / 1000}&d=5400&o=${(now - start) / 1000}`);
  });

  it("appends the template to the live address", () => {
    expect(replayUrl(channel({ mode: "append", days: 1, source: "?utc={utc}&lutc={lutc}" }), playlist, start, end, now))
      .toBe(`https://host/live/1.m3u8?utc=${start / 1000}&lutc=${now / 1000}`);
    expect(replayUrl(channel({ mode: "append", days: 1, source: "&utc={utc}" }, "https://host/l.m3u8?token=a"), playlist, start, end, now))
      .toBe(`https://host/l.m3u8?token=a&utc=${start / 1000}`);
  });

  it("uses utc and lutc for shift and an archive file name for flussonic", () => {
    expect(replayUrl(channel({ mode: "shift", days: 1 }), playlist, start, end, now))
      .toBe(`https://host/live/1.m3u8?utc=${start / 1000}&lutc=${now / 1000}`);
    expect(replayUrl(channel({ mode: "flussonic", days: 1 }), playlist, start, end, now))
      .toBe(`https://host/live/archive-${start / 1000}-5400.m3u8`);
  });

  it("returns null when the channel has no archive", () => {
    expect(replayUrl(channel(undefined), playlist, start, end, now)).toBeNull();
  });
});

describe("M3U catch-up attributes", () => {
  it("reads the mode, the source and the number of days", () => {
    expect(catchupFromAttributes({ catchup: "append", "catchup-source": "?utc={utc}", "catchup-days": "7" }))
      .toEqual({ mode: "append", days: 7, source: "?utc={utc}" });
    expect(catchupFromAttributes({ "catchup-source": "https://h/{utc}" })).toMatchObject({ mode: "default" });
    expect(catchupFromAttributes({ catchup: "shift" })).toMatchObject({ mode: "shift", days: 1 });
  });

  it("ignores a template mode without a source and unknown modes", () => {
    expect(catchupFromAttributes({ catchup: "append" })).toBeUndefined();
    expect(catchupFromAttributes({ catchup: "vod" })).toBeUndefined();
    expect(catchupFromAttributes({})).toBeUndefined();
  });

  it("is carried onto the parsed channel", () => {
    const content = [
      "#EXTM3U",
      '#EXTINF:-1 catchup="shift" catchup-days="3",One',
      "https://host/one.m3u8",
      "#EXTINF:-1,Two",
      "https://host/two.m3u8",
    ].join("\n");
    const { channels } = parseM3uCatalog(content, { id: "p", name: "P" });
    expect(channels[0].catchup).toEqual({ mode: "shift", days: 3, source: undefined });
    expect(channels[1].catchup).toBeUndefined();
  });
});
