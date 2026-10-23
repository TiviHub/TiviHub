import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveBrowser, RADIO_CATEGORY_ID } from "../browse/live";
import { BROWSE_PAGE_SIZE } from "../browse/types";
import type { LiveChannel, Playlist } from "../types";

const base: Playlist = {
  id: "p1",
  name: "Source",
  type: "M3U",
  url: "https://provider.example/list.m3u",
  username: "",
  password: "",
  active: true,
  drmLicenseUrl: "",
  drmSystem: "com.widevine.alpha",
  createdAt: 1,
};

function channel(index: number, group: string): LiveChannel {
  return { id: `p1:live:${index}`, playlistId: "p1", providerId: String(index), name: `Channel ${index}`, group, streamUrl: `https://x/${index}` };
}

afterEach(() => vi.unstubAllGlobals());

describe("live browser", () => {
  it("lists M3U groups with counts and pages one group at a time", async () => {
    const stored = [
      ...Array.from({ length: BROWSE_PAGE_SIZE + 5 }, (_, i) => channel(i, "News")),
      channel(900, "Sport"),
    ];
    const load = vi.fn(async () => stored);
    const browser = createLiveBrowser(base, load);

    expect(await browser.categories()).toEqual([
      { id: "News", name: "News", count: BROWSE_PAGE_SIZE + 5 },
      { id: "Sport", name: "Sport", count: 1 },
    ]);
    const first = await browser.page("News");
    expect(first.items).toHaveLength(BROWSE_PAGE_SIZE);
    expect(first.total).toBe(BROWSE_PAGE_SIZE + 5);
    const second = await browser.page("News", first.nextCursor);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeUndefined();
    expect((await browser.page(null)).total).toBe(BROWSE_PAGE_SIZE + 6);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("filters a category by name and offers radio stations as their own category", async () => {
    const stored = [
      channel(1, "News"),
      { ...channel(2, "Music"), name: "Jazz FM", radio: true },
    ];
    const browser = createLiveBrowser(base, async () => stored);
    expect((await browser.categories())[0]).toEqual({ id: RADIO_CATEGORY_ID, name: "Radio", count: 1 });
    expect((await browser.page(RADIO_CATEGORY_ID)).items.map((item) => item.name)).toEqual(["Jazz FM"]);
    expect((await browser.page(null, undefined, "jazz")).items).toHaveLength(1);
    expect(await browser.channelsOf("News")).toHaveLength(1);
  });

  it("asks an Xtream provider for one category at a time and remembers the answer", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requested.push(`${url.searchParams.get("action")}:${url.searchParams.get("category_id") ?? ""}`);
      const body = url.searchParams.get("action") === "get_live_categories"
        ? [{ category_id: "1", category_name: "News" }]
        : [{ stream_id: 7, name: "Late News", category_id: "1" }];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const browser = createLiveBrowser({ ...base, type: "XTREAM", url: "https://provider.example/", username: "u", password: "p" }, async () => []);

    await browser.categories();
    await browser.page("1");
    await browser.page("1");
    expect(requested).toEqual(["get_live_categories:", "get_live_streams:1"]);
  });

  it("retries after a failed request instead of remembering the failure", async () => {
    const load = vi.fn<() => Promise<LiveChannel[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([channel(1, "News")]);
    const browser = createLiveBrowser(base, load);
    await expect(browser.categories()).rejects.toThrow("offline");
    expect(await browser.categories()).toHaveLength(1);
  });
});
