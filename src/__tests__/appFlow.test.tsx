// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { removeLibraryItem, saveLibraryItem } from "../storage/database";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application source lifecycle", () => {
  it("features the most recently watched item for resuming across sources", async () => {
    const user = userEvent.setup();
    const resumeItemId = "previous-source:MOVIE:recent-playback";
    await saveLibraryItem({
      id: resumeItemId,
      contentId: "recent-playback",
      contentType: "MOVIE",
      playlistId: "previous-source",
      title: "Most recent playback",
      streamUrl: "https://provider.example/recent-playback.m3u8",
      status: "WATCHING",
      positionMillis: 30_000,
      durationMillis: 120_000,
      updatedAt: Date.now(),
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("TiviHub Demo Library");
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);

    expect(await screen.findByRole("heading", { name: "Most recent playback" })).toBeTruthy();
    expect(screen.getByText("CONTINUE WATCHING")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/)).toBeTruthy();
    await removeLibraryItem(resumeItemId);
  }, 30_000);

  it("shows a start-watching state when a source has content but the library is empty", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("TiviHub Demo Library");
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);

    expect(await screen.findByRole("heading", { name: "Your library is empty" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start watching" }));
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();

    document.documentElement.scrollTop = 500;
    document.body.scrollTop = 500;
    await user.click(screen.getByRole("button", { name: "View details for Big Buck Bunny (2008)" }));
    await waitFor(() => expect(document.documentElement.scrollTop).toBe(0));
    expect(await screen.findByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeTruthy();

    window.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 3 }));
    expect(await screen.findByRole("button", { name: "View details for Big Buck Bunny (2008)" })).toBeTruthy();
    window.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 4 }));
    expect(await screen.findByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/)).toBeTruthy();
  }, 30_000);

  it("adds a demo source and deletes a populated playlist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("TiviHub Demo Library");

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);

    expect(await screen.findByText(/and its local data were deleted/)).toBeTruthy();
  }, 30_000);
});
