// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BROWSE_PAGE_SIZE } from "../browse/types";
import { LiveTvPage } from "../components/LiveTvPage";
import type { Favorite, LiveChannel, Playlist } from "../types";

afterEach(cleanup);

const source: Playlist = {
  id: "p", name: "P", type: "M3U", url: "https://host/list.m3u", username: "", password: "",
  active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1,
};

const channel = (index: number, group: string): LiveChannel => ({
  id: `p:live:${index}`, playlistId: "p", name: `Channel ${index}`, group, streamUrl: `https://host/${index}.m3u8`,
});

function renderLive(channels: LiveChannel[], favorites: Favorite[] = []) {
  const onPlay = vi.fn();
  const onToggleFavorite = vi.fn();
  render(<LiveTvPage
    epg={[]}
    favorites={favorites}
    guideLoading={false}
    onLoadGuideForChannels={vi.fn()}
    onPlay={onPlay}
    onReplay={vi.fn()}
    onToggleFavorite={onToggleFavorite}
    showAdultContent
    source={source}
    storedChannels={channels}
  />);
  return { onPlay, onToggleFavorite };
}

describe("Live TV browsing", () => {
  const channels = [
    ...Array.from({ length: BROWSE_PAGE_SIZE + 10 }, (_, i) => channel(i, "News")),
    channel(500, "Sport"),
  ];

  it("shows the first batch of a category and the rest on demand", async () => {
    const user = userEvent.setup();
    renderLive(channels);

    await screen.findByRole("button", { name: "Play Channel 0" });
    expect(screen.getAllByRole("listitem")).toHaveLength(BROWSE_PAGE_SIZE);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(BROWSE_PAGE_SIZE + 11);
  });

  it("opens only the chosen category", async () => {
    const user = userEvent.setup();
    renderLive(channels);

    await user.click(await screen.findByRole("button", { name: /^Sport/ }));

    expect(await screen.findByRole("button", { name: "Play Channel 500" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("searches inside the open category", async () => {
    const user = userEvent.setup();
    renderLive(channels);

    await screen.findByRole("button", { name: "Play Channel 0" });
    await user.type(screen.getByRole("textbox", { name: "Search Live TV" }), "Channel 500");

    expect(await screen.findByRole("button", { name: "Play Channel 500" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("lists favorites without asking the source and plays them", async () => {
    const user = userEvent.setup();
    const favorite: Favorite = {
      id: "f1", contentId: "p:live:9", contentType: "LIVE", title: "Saved Channel", playlistId: "p",
      streamUrl: "https://host/9.m3u8", addedAt: 1,
    };
    const { onPlay } = renderLive(channels, [favorite]);

    await user.click(await screen.findByRole("button", { name: /^Favorites/ }));
    const row = within(screen.getByRole("list"));
    await user.click(row.getByRole("button", { name: "Play Saved Channel" }));

    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "p:live:9", title: "Saved Channel" }));
  });
});
