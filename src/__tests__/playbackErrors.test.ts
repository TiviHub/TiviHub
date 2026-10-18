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

    expect(message).toBe("The stream is taking too long to respond. Check your connection and try again.");
    expect(message).not.toContain("1003");
    expect(message).not.toContain("provider.example");
  });

  it("explains unsuccessful HTTP responses separately from timeouts", () => {
    expect(playbackErrorMessage({ code: 1001, data: ["", 403] }))
      .toContain("provider couldn't open");
    expect(playbackErrorMessage({ code: 1001, data: ["", 509] }))
      .toContain("temporarily limiting requests");
  });

  it("explains unsupported media in plain language without exposing the Shaka code", () => {
    const message = playbackErrorMessage({ code: 4032, message: "Shaka Error 4032" });

    expect(message).toBe("This stream isn't compatible with this device. Try another stream or device.");
    expect(message).not.toContain("4032");
  });

  it("does not show raw technical errors to the user", () => {
    expect(playbackErrorMessage(new Error("net::ERR_ACCESS_DENIED https://secret.example/token")))
      .toBe("Couldn't play this stream. Try again or choose another stream.");
  });
});
