import { describe, expect, it } from "vitest";
import {
  addChannel, audibleKeyAfter, channelKey, MAX_MULTIVIEW_TILES, multiViewColumns, multiViewSupport, removeChannel,
} from "../lib/multiView";
import type { LiveChannel } from "../types";

const channel = (id: string, extra: Partial<LiveChannel> = {}): LiveChannel => ({
  id, playlistId: "p", name: id, group: "News", streamUrl: `https://host/${id}.m3u8`, ...extra,
});

describe("multiview", () => {
  it("holds at most four different channels", () => {
    let tiles: LiveChannel[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) tiles = addChannel(tiles, channel(id));
    expect(tiles.map((tile) => tile.id)).toEqual(["a", "b", "c", "d"]);
    expect(tiles).toHaveLength(MAX_MULTIVIEW_TILES);
    expect(addChannel([channel("a")], channel("a"))).toHaveLength(1);
  });

  it("tells channels of two sources with the same id apart", () => {
    const tiles = addChannel([channel("a")], channel("a", { playlistId: "other" }));
    expect(tiles.map(channelKey)).toEqual(["p:a", "other:a"]);
  });

  it("keeps the sound on the same tile, and hands it on when that tile goes", () => {
    const tiles = [channel("a"), channel("b"), channel("c")];
    expect(audibleKeyAfter(tiles, "p:b")).toBe("p:b");
    const after = removeChannel(tiles, "p:b");
    expect(audibleKeyAfter(after, "p:b")).toBe("p:a");
    expect(audibleKeyAfter([], "p:b")).toBeNull();
  });

  it("only shows streams that need no licence flow or portal address", () => {
    expect(multiViewSupport(channel("a"), { type: "XTREAM" })).toBe("ok");
    expect(multiViewSupport(channel("a", { drmLicenseUrl: "https://license.example" }), { type: "M3U" })).toBe("drm");
    expect(multiViewSupport(channel("a"), { type: "STALKER" })).toBe("portal");
  });

  it("uses one column for one tile and two for more", () => {
    expect([0, 1, 2, 3, 4].map(multiViewColumns)).toEqual([1, 1, 2, 2, 2]);
  });
});
