import { describe, expect, it } from "vitest";
import {
  browserSummary,
  canUseNativeHlsFallback,
  createPlaybackDiagnosticReport,
  playbackDiagnosticError,
} from "../playbackDiagnostics";

describe("playback diagnostics", () => {
  it("offers native HLS only for HLS URLs when the browser reports possible support", () => {
    expect(canUseNativeHlsFallback("https://provider.example/live.m3u8?token=private", "maybe")).toBe(true);
    expect(canUseNativeHlsFallback("https://provider.example/live.mp4", "probably")).toBe(false);
    expect(canUseNativeHlsFallback("https://provider.example/live.m3u8", "no")).toBe(false);
    expect(canUseNativeHlsFallback("not a URL", "probably")).toBe(false);
  });

  it("keeps only numeric error details and excludes private data from the report", () => {
    const details = playbackDiagnosticError({
      category: 4,
      code: 4032,
      data: ["https://user:secret@provider.example/live.m3u8?token=private", 403],
      message: "Private channel name",
    });
    const report = createPlaybackDiagnosticReport({
      appVersion: "1.3.0",
      browser: "Edge WebView2 155",
      failures: [{ path: "Shaka Player", ...details }],
      drmConfigured: false,
      nativeHlsFallbackAttempted: true,
      mediaSourceAvailable: true,
      h264AacMp4Supported: true,
      h264AacMpegTsSupported: false,
      nativeHlsSupport: "no",
      backendErrors: [
        { component: "chromecast", code: "CAST_START_FAILED" },
        { component: "https://provider.example", code: "token=private" },
      ],
    });

    expect(details).toEqual({ code: 4032, category: 4 });
    expect(report).toContain("No compatible playback variant (Shaka 4032)");
    expect(report).toContain("Native HLS fallback attempted: yes");
    expect(report).toContain("MSE H.264/AAC MPEG-TS support: no");
    expect(report).toContain("chromecast: CAST_START_FAILED");
    expect(report).not.toContain("provider.example");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("Private channel name");
    expect(report).not.toContain("token=private");
  });

  it("handles errors without numeric Shaka details", () => {
    expect(playbackDiagnosticError(new Error("An error containing private data"))).toEqual({});
  });

  it("includes an HTTP status only for Shaka's failed-response error", () => {
    expect(playbackDiagnosticError({
      code: 1001,
      data: ["https://user:secret@provider.example/movie.m3u8", 403],
    })).toEqual({ code: 1001, httpStatus: 403 });
    expect(playbackDiagnosticError({ code: 4032, data: ["private", 403] }))
      .toEqual({ code: 4032 });
  });

  it("describes unavailable capability APIs without claiming support", () => {
    const report = createPlaybackDiagnosticReport({
      appVersion: "1.3.0",
      browser: "Unknown browser",
      failures: [],
      drmConfigured: true,
      nativeHlsFallbackAttempted: false,
      mediaSourceAvailable: false,
      h264AacMp4Supported: null,
      h264AacMpegTsSupported: null,
      nativeHlsSupport: "unavailable",
      backendErrors: [],
    });

    expect(report).toContain("DRM configured: yes");
    expect(report).toContain("MSE H.264/AAC MP4 support: unavailable");
    expect(report).toContain("Native HLS support: unavailable");
    expect(report).toContain("Playback errors:\nNone recorded.");
    expect(report).toContain("Backend errors:\nNone recorded in this app session.");
  });

  it("summarizes the browser family and major version without copying the full user agent", () => {
    expect(browserSummary("Mozilla/5.0 Windows Edg/155.0.2 Chrome/155.0.0"))
      .toBe("Edge WebView2 155");
    expect(browserSummary("unrecognized device details")).toBe("Unknown browser");
  });
});
