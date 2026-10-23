import { describe, expect, it } from "vitest";
import { keepM3uIds } from "../m3uIds";
import { parseM3uCatalog } from "../providers/m3u";

const context = { id: "p", name: "P" };
const list = (...entries: string[]) =>
  ["#EXTM3U", ...entries.flatMap((entry) => [`#EXTINF:-1,${entry}`, `https://host/${entry}.m3u8`])].join("\n");

describe("keepM3uIds", () => {
  it("keeps the id of a channel when another one is added above it", () => {
    const before = parseM3uCatalog(list("a", "b"), context);
    const after = parseM3uCatalog(list("new", "a", "b"), context);
    keepM3uIds(after, before);
    const ids = Object.fromEntries(after.channels.map((channel) => [channel.name, channel.id]));
    expect(ids.a).toBe(before.channels[0].id);
    expect(ids.b).toBe(before.channels[1].id);
    expect(new Set(Object.values(ids)).size).toBe(3);
  });

  it("keeps episodes attached to their series", () => {
    const series = (...names: string[]) => parseM3uCatalog(
      ["#EXTM3U", ...names.flatMap((name) => [`#EXTINF:-1 group-title="Series",${name} S01E01`, `https://host/${name}.mp4`])].join("\n"),
      context,
    );
    const before = series("Show");
    const after = series("Other", "Show");
    keepM3uIds(after, before);
    const show = after.series.find((item) => item.name === "Show")!;
    expect(show.id).toBe(before.series[0].id);
    expect(after.episodes.find((episode) => episode.streamUrl.endsWith("Show.mp4"))!.seriesId).toBe(show.id);
  });
});

describe("keepM3uIds at scale", () => {
  it("matches 200,000 channels in well under a few seconds, even when many share one URL", () => {
    const build = (offset: number) => {
      const lines = ["#EXTM3U"];
      for (let index = 0; index < 200_000; index += 1) {
        lines.push(`#EXTINF:-1,Channel ${index}`, `https://host/${index < 50_000 ? "same" : index + offset}.m3u8`);
      }
      return parseM3uCatalog(lines.join("\n"), context);
    };
    const before = build(0);
    const after = build(1);
    const started = performance.now();
    keepM3uIds(after, before);
    const elapsed = performance.now() - started;
    console.log(`keepM3uIds on 200k channels: ${elapsed.toFixed(0)} ms`);
    expect(new Set(after.channels.map((channel) => channel.id)).size).toBe(200_000);
    expect(elapsed).toBeLessThan(3000);
  });
});
