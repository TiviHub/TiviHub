import { describe, expect, it } from "vitest";
import { buildUpdaterManifest } from "../../scripts/updater-manifest.mjs";

describe("updater manifest", () => {
  it("points the Windows platform at the versioned release installer", () => {
    expect(buildUpdaterManifest({
      version: "2.2.0",
      notes: "Notes",
      signature: "SIG",
      date: new Date("2026-01-02T03:04:05Z"),
    })).toEqual({
      version: "2.2.0",
      notes: "Notes",
      pub_date: "2026-01-02T03:04:05.000Z",
      platforms: {
        "windows-x86_64": {
          signature: "SIG",
          url: "https://github.com/TiviHub/TiviHub/releases/download/v2.2.0/TiviHub-v2.2.0-windows-x64.exe",
        },
      },
    });
  });
});
