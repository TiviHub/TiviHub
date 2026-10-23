import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "../backup";
import type { UserDataSnapshot } from "../types";

const snapshot: UserDataSnapshot = {
  version: 1,
  exportedAt: 1_700_000_000_000,
  playlists: [],
  documents: [],
  channels: [],
  movies: [],
  series: [],
  episodes: [],
  favorites: [],
  library: [],
  epg: [],
  openSubtitlesApiKey: "",
  theme: "dark",
};

describe("encrypted backups", () => {
  it("round-trips a snapshot with the backup password", async () => {
    const encrypted = await encryptBackup(snapshot, "a-long-test-password");
    await expect(decryptBackup(encrypted, "a-long-test-password")).resolves.toEqual(snapshot);
  });

  it("preserves adult-content visibility in encrypted backups", async () => {
    const settingsSnapshot = { ...snapshot, showAdultContent: true };
    const encrypted = await encryptBackup(settingsSnapshot, "a-long-test-password");
    await expect(decryptBackup(encrypted, "a-long-test-password")).resolves.toEqual(settingsSnapshot);
  });

  it("rejects a wrong password and an invalid backup", async () => {
    const encrypted = await encryptBackup(snapshot, "a-long-test-password");
    await expect(decryptBackup(encrypted, "another-password"))
      .rejects.toThrow(/Check the password/);
    await expect(decryptBackup("not a backup", "a-long-test-password"))
      .rejects.toThrow(/valid TiviHub backup/);
  });

  it("keeps a source's User-Agent and refuses one with control characters", async () => {
    const source = {
      id: "ua-source",
      name: "With User-Agent",
      type: "M3U" as const,
      url: "https://provider.example/list.m3u",
      username: "",
      password: "",
      active: true,
      drmLicenseUrl: "",
      drmSystem: "com.widevine.alpha" as const,
      createdAt: 1,
      userAgent: "VLC/3.0.20 LibVLC/3.0.20",
    };
    const good = { ...snapshot, playlists: [source] };
    await expect(decryptBackup(await encryptBackup(good, "a-long-test-password"), "a-long-test-password"))
      .resolves.toEqual(good);

    const bad = { ...snapshot, playlists: [{ ...source, userAgent: "VLC\r\nX-Injected: 1" }] };
    await expect(decryptBackup(await encryptBackup(bad, "a-long-test-password"), "a-long-test-password"))
      .rejects.toThrow(/invalid playlist/i);
  });

  it("rejects malformed records after successful decryption", async () => {
    const invalidSnapshot: UserDataSnapshot = {
      ...snapshot,
      playlists: [{
        id: "bad-source",
        name: "Bad source",
        type: "M3U",
        url: "javascript:alert(1)",
        username: "",
        password: "",
        active: true,
        drmLicenseUrl: "",
        drmSystem: "com.widevine.alpha",
        createdAt: 1,
      }],
    };
    const encrypted = await encryptBackup(invalidSnapshot, "a-long-test-password");
    await expect(decryptBackup(encrypted, "a-long-test-password"))
      .rejects.toThrow(/invalid playlist/i);
  });
});
