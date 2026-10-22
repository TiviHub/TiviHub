import { afterEach, describe, expect, it } from "vitest";
import { MOCK_PASSWORD, MOCK_USERNAME, startMockXtream } from "../../scripts/perf/mockXtream.mjs";
import { loadXtreamCatalog } from "../providers/xtream";
import type { Playlist } from "../types";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

function playlist(url: string, password = MOCK_PASSWORD): Playlist {
  return {
    id: "perf", name: "Perf", type: "XTREAM", url, username: MOCK_USERNAME, password,
    active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
  };
}

describe("mock Xtream server", () => {
  it("serves a dataset the real importer accepts over HTTP", async () => {
    const mock = await startMockXtream({ size: "S" });
    close = mock.close;

    const catalog = await loadXtreamCatalog(playlist(mock.url));

    expect(catalog.channels).toHaveLength(200);
    expect(catalog.movies).toHaveLength(100);
    expect(catalog.series).toHaveLength(50);
  });

  it("allows cross-origin reads and rejects wrong credentials", async () => {
    const mock = await startMockXtream({ size: "S" });
    close = mock.close;

    const ok = await fetch(`${mock.url}/player_api.php?username=${MOCK_USERNAME}&password=${MOCK_PASSWORD}`);
    expect(ok.headers.get("access-control-allow-origin")).toBe("*");
    await expect(loadXtreamCatalog(playlist(mock.url, "wrong"))).rejects.toThrow(/401/);
  });

  it("returns episodes for a series", async () => {
    const mock = await startMockXtream({ size: "S" });
    close = mock.close;

    const response = await fetch(
      `${mock.url}/player_api.php?username=${MOCK_USERNAME}&password=${MOCK_PASSWORD}&action=get_series_info&series_id=3`,
    );
    const body = (await response.json()) as { episodes: Record<string, unknown[]> };

    expect(Object.keys(body.episodes).length).toBeGreaterThan(0);
  });
});
