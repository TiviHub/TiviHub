// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { deletePlaylist, savePlaylist, setActivePlaylist } from "../storage/database";
import type { Playlist } from "../types";

const expiredPlaylist: Playlist = {
  id: "expired-topbar-playlist",
  name: "Expired provider",
  type: "XTREAM",
  url: "https://expired.provider.example",
  username: "user",
  password: "password",
  active: true,
  drmLicenseUrl: "",
  drmSystem: "com.widevine.alpha",
  createdAt: 1,
  lastCatalogRefreshAt: Date.now() - 25 * 60 * 60 * 1000,
  expiresAtMillis: Date.now() - 60_000,
};

beforeEach(async () => {
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
  vi.stubGlobal("ResizeObserver", class {
    constructor(_callback: ResizeObserverCallback) {}
    observe() {}
    disconnect() {}
  });
  await savePlaylist(expiredPlaylist);
  await setActivePlaylist(expiredPlaylist.id);
});

afterEach(async () => {
  cleanup();
  await deletePlaylist(expiredPlaylist.id);
  vi.unstubAllGlobals();
});

describe("expired playlist warning", () => {
  it("shows a topbar warning and skips an expired catalog refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());
    const warning = await screen.findByRole("button", { name: "Playlist expired" });
    expect(warning).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("expired.provider.example"))).toBe(false);

    await user.click(warning);
    expect(await screen.findByRole("dialog", { name: "Edit playlist" })).toBeTruthy();
  });
});
