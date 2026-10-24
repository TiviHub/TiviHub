// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveTvPage } from "../components/LiveTvPage";
import { parseM3uCatalog } from "../providers/m3u";
import type { LiveChannel, Playlist } from "../types";

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

const source: Playlist = {
  id: "p", name: "P", type: "M3U", url: "https://host/list.m3u", username: "", password: "",
  active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
};

describe("radio filter in Live TV", () => {
  function renderLive(channels: LiveChannel[]) {
    const onPlay = vi.fn();
    render(<LiveTvPage
      epg={[]}
      favorites={[]}
      guideLoading={false}
      onLoadGuideForChannels={vi.fn()}
      onPlay={onPlay}
      onReplay={vi.fn()}
      onToggleReminder={vi.fn()}
      reminderIds={new Set<string>()}
      onToggleFavorite={vi.fn()}
      showAdultContent
      source={source}
      storedChannels={channels}
    />);
    return onPlay;
  }

  it("lists only stations under Radio and plays them as radio", async () => {
    const user = userEvent.setup();
    const onPlay = renderLive([channel("tv", "Evening News"), channel("fm", "Jazz FM", { radio: true })]);

    await user.click(await screen.findByRole("button", { name: /^Radio/ }));

    expect(await screen.findByRole("button", { name: "Play Jazz FM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Evening News" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Play Jazz FM" }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "fm", radio: true }));
  });

  it("offers no Radio category when the source has no stations", async () => {
    renderLive([channel("tv", "Evening News")]);

    await screen.findByRole("button", { name: "Play Evening News" });
    expect(screen.queryByRole("button", { name: /^Radio/ })).toBeNull();
  });
});
