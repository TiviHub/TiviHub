// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LiveGuide } from "../components/LiveGuide";
import type { EpgProgram, LiveChannel } from "../types";

const HOUR = 3_600_000;
const noon = new Date(2026, 9, 23, 12, 0, 0).getTime();

const channel: LiveChannel = {
  id: "c1", playlistId: "p", name: "One", group: "News", streamUrl: "https://host/1.m3u8", tvgId: "one",
  catchup: { mode: "xtream", days: 2 },
};
const program = (id: string, title: string, startHours: number, hours = 1): EpgProgram => ({
  id, channelId: "one", title, source: "p", startMillis: noon + startHours * HOUR, endMillis: noon + (startHours + hours) * HOUR,
});
const epg = [program("a", "Morning show", -3), program("b", "Midday news", -0.5, 1.5), program("c", "Evening film", 3)];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(noon);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.requestFullscreen = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderGuide(channels = [channel], single = false) {
  const onPlay = vi.fn();
  const onReplay = vi.fn();
  render(
    <LiveGuide
      single={single}
      channels={channels}
      epg={epg}
      favoriteIds={new Set()}
      loading={false}
      onLoadGuideForChannels={vi.fn()}
      onPlay={onPlay}
      onReplay={onReplay}
    />,
  );
  return { onPlay, onReplay };
}

describe("TV guide replay", () => {
  it("watches the recording of a finished programme", () => {
    const { onPlay, onReplay } = renderGuide();
    fireEvent.click(screen.getByRole("button", { name: /Morning show.*Select to watch the recording/ }));
    expect(onReplay).toHaveBeenCalledWith(channel, epg[0]);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("plays a programme that has not started live", () => {
    const { onPlay, onReplay } = renderGuide();
    fireEvent.click(screen.getByRole("button", { name: /Evening film.*Select to play channel live/ }));
    expect(onPlay).toHaveBeenCalledWith(channel);
    expect(onReplay).not.toHaveBeenCalled();
  });

  it("offers start over on the programme on air", () => {
    const { onPlay, onReplay } = renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "Start over Midday news on One" }));
    expect(onReplay).toHaveBeenCalledWith(channel, epg[1]);
    fireEvent.click(screen.getByRole("button", { name: /Midday news.*Select to play channel live/ }));
    expect(onPlay).toHaveBeenCalledWith(channel);
  });

  it("shows no replay controls for a channel without an archive", () => {
    renderGuide([{ ...channel, catchup: undefined }]);
    expect(screen.queryByRole("button", { name: /Start over/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /watch the recording/ })).toBeNull();
  });
});

describe("single-channel guide under the player", () => {
  it("shows the day for one channel without the page heading, channel column or footer", () => {
    const { onReplay } = renderGuide([channel], true);

    expect(screen.queryByRole("heading", { name: "TV Guide" })).toBeNull();
    expect(screen.queryByText("CHANNEL")).toBeNull();
    expect(screen.queryByRole("button", { name: /Play One live/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Programme guide for One" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Morning show.*Select to watch the recording/ }));
    expect(onReplay).toHaveBeenCalledWith(channel, epg[0]);
  });
});
