import { describe, expect, it } from "vitest";
import {
  formatCatalogChangeSummary,
  isSuspiciousCatalogDrop,
  summarizeCatalogChanges,
  validateCatalogForSource,
  type CatalogCandidate,
  type CatalogSnapshot,
} from "../catalogRefresh";

function snapshot(
  overrides: Partial<CatalogSnapshot> = {},
): CatalogSnapshot {
  return {
    channels: [],
    movies: [],
    series: [],
    episodes: [],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<CatalogCandidate> = {},
): CatalogCandidate {
  return {
    channels: [],
    movies: [],
    series: [],
    ...overrides,
  };
}

function channels(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `channel-${index}`,
    playlistId: "source",
    name: `Channel ${index}`,
    group: "News",
    streamUrl: `https://provider.example/${index}.m3u8`,
  }));
}

describe("catalog refresh safety", () => {
  it("summarizes additions and removals by stable IDs", () => {
    const previous = snapshot({ channels: channels(3) });
    const next = candidate({
      channels: [channels(3)[0], {
        id: "new",
        playlistId: "source",
        name: "New",
        group: "News",
        streamUrl: "https://provider.example/new.m3u8",
      }],
    });
    const summary = summarizeCatalogChanges(previous, next);

    expect(summary.channels).toEqual({ added: 1, removed: 2 });
    expect(formatCatalogChangeSummary(summary)).toBe("1 added, 2 removed.");
  });

  it("flags empty catalogs and major per-category drops for review", () => {
    const previous = snapshot({ channels: channels(100) });

    expect(isSuspiciousCatalogDrop(previous, candidate())).toBe(true);
    expect(isSuspiciousCatalogDrop(
      previous,
      candidate({ channels: channels(40) }),
    )).toBe(true);
  });

  it("allows a new source and normal small changes without review", () => {
    expect(isSuspiciousCatalogDrop(snapshot(), candidate())).toBe(false);
    expect(isSuspiciousCatalogDrop(
      snapshot({ channels: channels(100) }),
      candidate({ channels: channels(95) }),
    )).toBe(false);
    expect(isSuspiciousCatalogDrop(
      snapshot({ channels: channels(100), episodes: Array.from({ length: 200 }, (_, index) => ({
        id: `episode-${index}`,
        playlistId: "source",
        seriesId: "series",
        season: 1,
        number: index,
        name: `Episode ${index}`,
        streamUrl: `https://provider.example/${index}.m3u8`,
      })) }),
      candidate({ channels: channels(100) }),
    )).toBe(false);
  });

  it("rejects records belonging to another source or duplicated IDs", () => {
    expect(() => validateCatalogForSource(
      "source",
      candidate({ channels: [{
        id: "channel",
        playlistId: "other",
        name: "Channel",
        group: "News",
        streamUrl: "https://provider.example/channel.m3u8",
      }] }),
    )).toThrow(/did not match this source/);
    expect(() => validateCatalogForSource(
      "source",
      candidate({ channels: channels(1).concat(channels(1)) }),
    )).toThrow(/duplicate items/);
  });
});
