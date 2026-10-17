import { describe, expect, it } from "vitest";
import { playbackErrorMessage } from "../playbackErrors";

describe("playback error messages", () => {
  it("identifies Shaka network timeouts instead of calling them media rejections", () => {
    const message = playbackErrorMessage({
      category: 1,
      code: 1003,
      data: ["https://provider.example/live.m3u8", 0],
      message: "Shaka Error 1003",
    });

    expect(message).toContain("timed out");
    expect(message).toContain("provider");
    expect(message).not.toContain("media error 1003");
    expect(message).not.toContain("provider.example");
  });

  it("explains unsuccessful HTTP responses separately from timeouts", () => {
    expect(playbackErrorMessage({ code: 1001, data: ["", 403] }))
      .toContain("unsuccessful response");
  });

  it("preserves native error messages", () => {
    expect(playbackErrorMessage(new Error("Playback was interrupted.")))
      .toBe("Playback was interrupted.");
  });
});
