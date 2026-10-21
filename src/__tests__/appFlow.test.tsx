// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
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
  vi.stubGlobal("ResizeObserver", class {
    constructor(_callback: ResizeObserverCallback) {}
    observe() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  window.localStorage.removeItem("tivihub.home.layout");
});

// Tests assume a first-run app, so wipe every database the previous test left behind.
async function clearAllDatabases() {
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    const database = await openDB(name);
    const stores = Array.from(database.objectStoreNames);
    if (stores.length) {
      const transaction = database.transaction(stores, "readwrite");
      stores.forEach((store) => void transaction.objectStore(store).clear());
      await transaction.done;
    }
    database.close();
  }
}

afterEach(async () => {
  cleanup();
  await clearAllDatabases();
  window.localStorage.removeItem("tivihub.home.layout");
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
    await screen.findAllByText("Demo HLS Channel 1"); // importing the demo switches to Live TV, so the source name is not on screen
    expect(screen.queryByRole("combobox", { name: "Active source" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);

    expect(await screen.findByRole("heading", { name: /^Continue watching/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume Most recent playback" })).toBeTruthy();
    expect(screen.queryByText("CONTINUE WATCHING")).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/, undefined, { timeout: 10_000 })).toBeTruthy();
    await removeLibraryItem(resumeItemId);
  }, 30_000);

  it("shows a start-watching state when a source has content but the library is empty", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("Demo HLS Channel 1"); // importing the demo switches to Live TV, so the source name is not on screen
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);

    expect(await screen.findByRole("heading", { name: "Make Home yours" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Explore content/ })).toBeTruthy();
    await user.click(within(document.querySelector("#desktop-navigation") as HTMLElement).getByRole("button", { name: "TV Guide" }));
    expect(await screen.findByRole("region", { name: "Full TV guide" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Timeline zoom (100%)" })).toBeTruthy();
    expect(screen.queryByText("READY TO WATCH")).toBeNull();
    expect(screen.queryByRole("button", { name: "Collapse player" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close guide" })).toBeNull();
    await user.click(within(document.querySelector("#desktop-navigation") as HTMLElement).getByRole("button", { name: "Live TV" }));
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);

    await user.click(screen.getByRole("button", { name: "Explore content" }));
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();
    const movieFavoriteButton = screen.getByRole("button", { name: "Add Big Buck Bunny (2008) to favorites" });
    await user.hover(movieFavoriteButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Add Movie to favorites");
    await user.unhover(movieFavoriteButton);
    const movieLibraryButton = screen.getByRole("button", { name: "Add Big Buck Bunny (2008) to your watchlist" });
    await user.hover(movieLibraryButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Add to watchlist");
    await user.unhover(movieLibraryButton);

    document.documentElement.scrollTop = 500;
    document.body.scrollTop = 500;
    const detailButton = screen.getByRole("button", { name: "View details for Big Buck Bunny (2008)" });
    expect(detailButton.hasAttribute("title")).toBe(false);
    await user.hover(detailButton);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.unhover(detailButton);
    await user.hover(screen.getByRole("button", { name: "Refresh playlist" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe("Refresh playlist");
    await user.unhover(screen.getByRole("button", { name: "Refresh playlist" }));
    const globalSearchButton = screen.getAllByRole("button", { name: "Search your library" })[0];
    await user.hover(globalSearchButton);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.unhover(globalSearchButton);
    await user.click(detailButton);
    await waitFor(() => expect(document.documentElement.scrollTop).toBe(0));
    expect(await screen.findByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeTruthy();
    await user.hover(screen.getByRole("button", { name: "Add to favorites" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.unhover(screen.getByRole("button", { name: "Add to favorites" }));

    window.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 3 }));
    expect(await screen.findByRole("button", { name: "View details for Big Buck Bunny (2008)" })).toBeTruthy();
    window.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 4 }));
    expect(await screen.findByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);
    expect(await screen.findByRole("heading", { name: "Make Home yours" })).toBeTruthy();
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(document.querySelector(".media-home")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Home" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Movies" })[0]);
    expect(await screen.findByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeTruthy();
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Movies" }));
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Big Buck Bunny (2008)" })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, 30_000);

  it("resets page scroll when navigating to another section", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("Demo HLS Channel 1"); // importing the demo switches to Live TV, so the source name is not on screen
    await user.click(screen.getAllByRole("button", { name: "Movies" })[0]);
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();

    document.documentElement.scrollTop = 500;
    document.body.scrollTop = 500;
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);
    await waitFor(() => {
      expect(document.documentElement.scrollTop).toBe(0);
      expect(document.body.scrollTop).toBe(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, 30_000);

  it("lets users hide, reorder, and reset Home sections", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("Demo HLS Channel 1"); // importing the demo switches to Live TV, so the source name is not on screen

    await user.click(screen.getAllByRole("button", { name: "Movies" })[0]);
    await user.click(await screen.findByRole("button", { name: "View details for Big Buck Bunny (2008)" }));
    await user.click(await screen.findByRole("button", { name: "Add to favorites" }));
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);
    expect(await screen.findByRole("heading", { name: /^Favorite movies/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit Home" }));
    await user.click(screen.getByRole("button", { name: "Move Favorite movies up" }));
    await user.click(screen.getByRole("button", { name: "Move Favorite movies up" }));
    await user.click(screen.getByRole("button", { name: "Move Favorite movies up" }));
    expect(JSON.parse(window.localStorage.getItem("tivihub.home.layout") ?? "{}").order[0]).toBe("favoriteMovies");

    await user.click(screen.getByRole("checkbox", { name: "Favorite movies" }));
    expect(screen.queryByRole("heading", { name: /^Favorite movies/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done editing" }));
    await user.click(screen.getAllByRole("button", { name: "Movies" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Home" })[0]);
    expect(screen.queryByRole("heading", { name: /^Favorite movies/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Home" }));
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(await screen.findByRole("heading", { name: /^Favorite movies/ })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(await screen.findByText(/and its local data were deleted/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, 30_000);

  it("adds a demo source and deletes a populated playlist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(await screen.findByRole("button", { name: "Import demo" }));
    await screen.findAllByText("Demo HLS Channel 1"); // importing the demo switches to Live TV, so the source name is not on screen

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete TiviHub Demo Library" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);

    expect(await screen.findByText(/and its local data were deleted/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, 30_000);

  it("opens Downloads below Library and reuses the Home empty-state layout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    const desktopNav = document.querySelector("#desktop-navigation");
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Live TV" }).hasAttribute("disabled")).toBe(false);
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Movies" }).hasAttribute("disabled")).toBe(false);
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Movies" }).querySelector(".material-icons")?.textContent).toBe("theaters");
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Series" }).hasAttribute("disabled")).toBe(false);
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Library" }).hasAttribute("disabled")).toBe(false);
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Library" }).querySelector(".material-icons")?.textContent).toBe("bookmark_border");
    expect(within(desktopNav as HTMLElement).getByRole("button", { name: "Downloads" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Refresh playlist" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add playlist" }).hasAttribute("disabled")).toBe(false);
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Home" })).toBeNull();

    await user.click(within(desktopNav as HTMLElement).getByRole("button", { name: "Live TV" }));
    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    await user.click(within(desktopNav as HTMLElement).getByRole("button", { name: "TV Guide" }));
    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    await user.click(within(desktopNav as HTMLElement).getByRole("button", { name: "Movies" }));
    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    await user.click(within(desktopNav as HTMLElement).getByRole("button", { name: "Series" }));
    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    expect(screen.queryByText("Loading popular titles...")).toBeNull();

    await user.click(within(desktopNav as HTMLElement).getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Downloads" })[0]);

    expect(await screen.findByRole("heading", { name: "Add your first source" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Downloads" })).toBeNull();
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(document.querySelector(".downloads-page")).toBeNull();
    expect(screen.getByRole("button", { name: /Add source/ })).toBeTruthy();
  });
});
