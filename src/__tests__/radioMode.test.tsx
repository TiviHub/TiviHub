// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogPage } from "../components/ContentPages";
import { parseM3uCatalog } from "../providers/m3u";
import type { LiveChannel } from "../types";

afterEach(cleanup);

const channel = (id: string, name: string, extra: Partial<LiveChannel> = {}): LiveChannel => ({
  id, playlistId: "p", name, group: "General", streamUrl: `https://host/${id}.m3u8`, ...extra,
});

describe("radio stations in the M3U parser", () => {
  const parse = (...entries: string[]) => parseM3uCatalog(
    ["#EXTM3U", ...entries.flatMap((entry, index) => entry.split("|").length === 2
      ? [`#EXTINF:-1 ${entry.split("|")[0]},Station ${index}`, `https://host/${index}.mp3`]
      : [])].join("\n"),
    { id: "p", name: "P" },
  ).channels;

  it("marks radio=\"true\" and a group called Radio, and lets radio=\"false\" opt out", () => {
    const [flagged, grouped, optedOut, plain] = parse(
      'radio="true" group-title="Music"|x',
      'group-title="Dutch Radio"|x',
      'radio="false" group-title="Radio"|x',
      'group-title="News"|x',
    );
    expect(flagged.radio).toBe(true);
    expect(grouped.radio).toBe(true);
    expect(optedOut.radio).toBeUndefined();
    expect(plain.radio).toBeUndefined();
  });
});

describe("radio filter in Live TV", () => {
  function renderLive(channels: LiveChannel[]) {
    const onPlay = vi.fn();
    render(<CatalogPage
      channels={channels}
      epg={[]}
      favorites={[]}
      library={[]}
      loading={false}
      movies={[]}
      onAddToLibrary={vi.fn()}
      onLoadGuideForChannels={vi.fn()}
      onOpenMovie={vi.fn()}
      onOpenSeries={vi.fn()}
      onPlay={onPlay}
      onToggleFavorite={vi.fn()}
      section="Live TV"
      series={[]}
    />);
    return onPlay;
  }

  it("lists only stations under Radio and plays them as radio", async () => {
    const user = userEvent.setup();
    const onPlay = renderLive([channel("tv", "Evening News"), channel("fm", "Jazz FM", { radio: true })]);

    await user.click(screen.getByRole("combobox", { name: "Filter by category" }));
    await user.click(await screen.findByRole("option", { name: "Radio" }));

    expect(screen.queryByRole("button", { name: "Play Evening News" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Play Jazz FM" }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "fm", radio: true }));
  });

  it("offers no Radio filter when the source has no stations", async () => {
    const user = userEvent.setup();
    renderLive([channel("tv", "Evening News")]);

    await user.click(screen.getByRole("combobox", { name: "Filter by category" }));

    expect(screen.queryByRole("option", { name: "Radio" })).toBeNull();
  });
});
