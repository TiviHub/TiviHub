import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, latestAvailableUpdate } from "../updates";

afterEach(() => vi.unstubAllGlobals());

function release(tag: string, options: { prerelease?: boolean; draft?: boolean; installer?: boolean } = {}) {
  return {
    tag_name: tag,
    html_url: `https://github.com/TiviHub/TiviHub/releases/tag/${tag}`,
    prerelease: options.prerelease ?? tag.includes("-"),
    draft: options.draft ?? false,
    assets: options.installer === false ? [] : [{ name: "TiviHub-setup.exe" }],
  };
}

describe("GitHub release updates", () => {
  it("selects the newest stable version for a stable installation", () => {
    expect(latestAvailableUpdate([
      release("v1.2.0-beta.1"),
      release("v1.0.2"),
      release("v1.0.1"),
    ], "1.0.0")).toEqual({
      version: "1.0.2",
      installerUrl: "https://github.com/TiviHub/TiviHub/releases/download/v1.0.2/TiviHub-setup.exe",
    });
  });

  it("offers stable and prerelease updates to a prerelease installation", () => {
    expect(latestAvailableUpdate([
      release("v1.1.0-beta.2"),
      release("v1.1.0-beta.1"),
    ], "1.1.0-beta.1")?.version).toBe("1.1.0-beta.2");
    expect(latestAvailableUpdate([
      release("v1.1.0"),
      release("v1.1.0-beta.2"),
    ], "1.1.0-beta.1")?.version).toBe("1.1.0");
  });

  it("ignores drafts, releases without installers, older versions, and unsafe URLs", () => {
    expect(latestAvailableUpdate([
      release("v1.1.0", { draft: true }),
      release("v1.0.1", { installer: false }),
      {
        ...release("v1.2.0"),
        html_url: "https://example.com/TiviHub/TiviHub/releases/tag/v1.2.0",
      },
      release("v0.9.9"),
    ], "1.0.0")).toBeNull();
  });

  it("reports GitHub request failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(checkForUpdate("1.0.0")).rejects.toThrow("GitHub returned HTTP 503");
  });

  it("rejects invalid installed versions and malformed releases data", () => {
    expect(() => latestAvailableUpdate([], "v1.0")).toThrow(/installed app version/i);
    expect(() => latestAvailableUpdate({}, "1.0.0")).toThrow(/invalid releases list/i);
  });
});
