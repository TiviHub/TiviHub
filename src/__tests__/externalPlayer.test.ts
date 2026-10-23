// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { canOpenExternally, openInExternalPlayer } from "../services/externalPlayer";
import { soundIsMissing } from "../lib/playbackAudio";

afterEach(() => vi.unstubAllGlobals());

describe("missing sound detection", () => {
  it("flags a picture that decodes without any audio", () => {
    expect(soundIsMissing({ webkitVideoDecodedByteCount: 2_000_000, webkitAudioDecodedByteCount: 0 })).toBe(true);
  });

  it("does not flag a file whose sound decodes", () => {
    expect(soundIsMissing({ webkitVideoDecodedByteCount: 2_000_000, webkitAudioDecodedByteCount: 70_000 })).toBe(false);
  });

  it("does not flag nothing decoded yet, a silent file before it starts, or an engine without the counters", () => {
    expect(soundIsMissing({ webkitVideoDecodedByteCount: 0, webkitAudioDecodedByteCount: 0 })).toBe(false);
    expect(soundIsMissing({})).toBe(false);
    expect(soundIsMissing({ webkitVideoDecodedByteCount: 5 })).toBe(false);
  });
});

describe("external player", () => {
  it("is offered only in the desktop app", () => {
    expect(canOpenExternally()).toBe(false);
    vi.stubGlobal("isTauri", true);
    expect(canOpenExternally()).toBe(true);
  });

  it("hands the address and the User-Agent to the backend and returns the program that started", async () => {
    const invoke = vi.fn(async () => "VLC");
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke });

    await expect(openInExternalPlayer("https://host.example/play.php?x=1", "Custom/1")).resolves.toBe("VLC");
    expect(invoke).toHaveBeenCalledWith(
      "open_in_external_player",
      { url: "https://host.example/play.php?x=1", userAgent: "Custom/1" },
      undefined,
    );
  });

  it("passes the backend's reason through when no player is installed", async () => {
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("__TAURI_INTERNALS__", {
      invoke: vi.fn(async () => { throw "No external player found. Install VLC or mpv and try again."; }),
    });
    await expect(openInExternalPlayer("https://host.example/a")).rejects.toBe("No external player found. Install VLC or mpv and try again.");
  });
});
