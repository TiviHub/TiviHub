import { describe, expect, it } from "vitest";
import type { Playlist } from "../types";
import {
  CATALOG_REFRESH_INTERVAL,
  canAutoRefreshCatalog,
  catalogRefreshDueAt,
  isCatalogRefreshDue,
} from "../catalogCache";

function source(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: "source",
    name: "Source",
    type: "XTREAM",
    url: "https://provider.example",
    username: "",
    password: "",
    active: true,
    drmLicenseUrl: "",
    drmSystem: "com.widevine.alpha",
    createdAt: 1_000,
    ...overrides,
  };
}

describe("catalog cache refresh", () => {
  it("refreshes a stale remote catalog after 24 hours", () => {
    const playlist = source({ lastCatalogRefreshAt: 5_000 });

    expect(catalogRefreshDueAt(playlist)).toBe(5_000 + CATALOG_REFRESH_INTERVAL);
    expect(isCatalogRefreshDue(playlist, 5_000 + CATALOG_REFRESH_INTERVAL - 1)).toBe(false);
    expect(isCatalogRefreshDue(playlist, 5_000 + CATALOG_REFRESH_INTERVAL)).toBe(true);
  });

  it("uses source creation time for catalogs without a refresh timestamp", () => {
    expect(isCatalogRefreshDue(source(), 1_000 + CATALOG_REFRESH_INTERVAL)).toBe(true);
  });

  it("auto-refreshes only remote playlists, not local files or development demos", () => {
    expect(canAutoRefreshCatalog(source({ type: "M3U" }))).toBe(true);
    expect(canAutoRefreshCatalog(source({ type: "M3U", fileName: "local.m3u" }))).toBe(false);
    expect(canAutoRefreshCatalog(source({ demo: true }))).toBe(false);
  });
});
