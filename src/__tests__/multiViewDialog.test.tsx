// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MultiViewDialog } from "../components/MultiViewDialog";
import type { LiveChannel, Playlist } from "../types";

vi.mock("../components/MultiViewTile", () => ({
  MultiViewTile: ({ channel, audible, onSelectAudio, onRemove }: {
    channel: LiveChannel; audible: boolean; onSelectAudio: () => void; onRemove: () => void;
  }) => (
    <div data-testid="tile">
      <span>{channel.name}</span>
      <button onClick={onSelectAudio} type="button">{audible ? `sound:${channel.name}` : `mute:${channel.name}`}</button>
      <button onClick={onRemove} type="button">{`remove:${channel.name}`}</button>
    </div>
  ),
}));

const channel = (id: string, extra: Partial<LiveChannel> = {}): LiveChannel => ({
  id, playlistId: "p", name: `Channel ${id}`, group: "News", streamUrl: `https://host/${id}.m3u8`, ...extra,
});
const source = { id: "p", type: "XTREAM" } as Playlist;
const channels = [channel("1"), channel("2"), channel("3"), channel("4"), channel("5"), channel("drm", { drmLicenseUrl: "https://license.example" })];

afterEach(cleanup);

describe("multiview dialog", () => {
  it("starts with the channel on screen and moves the sound between tiles", () => {
    render(<MultiViewDialog channels={channels} onClose={vi.fn()} source={source} start={channels[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a channel" }));
    fireEvent.click(screen.getByRole("button", { name: "Channel 2" }));
    expect(screen.getAllByTestId("tile")).toHaveLength(2);
    expect(screen.getByText("sound:Channel 1")).toBeTruthy();
    fireEvent.click(screen.getByText("mute:Channel 2"));
    expect(screen.getByText("sound:Channel 2")).toBeTruthy();
    fireEvent.click(screen.getByText("remove:Channel 2"));
    expect(screen.getByText("sound:Channel 1")).toBeTruthy();
  });

  it("refuses a protected channel, and stops offering channels at four tiles", () => {
    render(<MultiViewDialog channels={channels} onClose={vi.fn()} source={source} start={channels[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a channel" }));
    fireEvent.click(screen.getByRole("button", { name: "Channel drm" }));
    expect(screen.getByRole("alert").textContent).toBe("Protected (DRM) channels cannot be shown in multiview.");
    expect(screen.getAllByTestId("tile")).toHaveLength(1);
    for (const id of ["2", "3", "4"]) fireEvent.click(screen.getByRole("button", { name: `Channel ${id}` }));
    expect(screen.getAllByTestId("tile")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Add a channel" })).toBeNull();
  });

  it("closes with the button and with Escape", () => {
    const onClose = vi.fn();
    render(<MultiViewDialog channels={channels} onClose={onClose} source={source} start={channels[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Close multiview" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
