// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { LibraryPage } from "../components/ContentPages";
import { PlaylistDeletionProgress } from "../components/PlaylistDeletionProgress";
import { PlaylistDialog, type PlaylistDraft } from "../components/PlaylistDialog";
import { SettingsPage } from "../components/SettingsPage";
import type { Favorite, LibraryItem, Playlist } from "../types";

const source: Playlist = {
  id: "user-action-source",
  name: "Living room",
  type: "M3U",
  url: "https://provider.example/playlist.m3u",
  username: "",
  password: "",
  active: true,
  drmLicenseUrl: "",
  drmSystem: "com.widevine.alpha",
  createdAt: 1,
};

const settingsProps: ComponentProps<typeof SettingsPage> = {
  theme: "dark",
  onChooseTheme: vi.fn(),
  showAdultContent: false,
  onSetShowAdultContent: vi.fn(),
  sources: [source, { ...source, id: "other-source", name: "Bedroom", active: false }],
  activeSourceId: source.id,
  onAddSource: vi.fn(),
  onActivate: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRefreshSource: vi.fn(),
  refreshing: false,
  version: "1.4.0",
  isDesktopApp: false,
  updateStatus: "idle",
  availableUpdateVersion: null,
  onUpdateAction: vi.fn(),
  apiKey: "",
  onSaveApiKey: vi.fn(async () => undefined),
  onDataRestored: vi.fn(async () => undefined),
  onRefreshEpg: vi.fn(async () => undefined),
  onDownloadDiagnostics: vi.fn(async () => true),
};

function makeLibraryItem(
  id: string,
  contentType: LibraryItem["contentType"],
  status: LibraryItem["status"] = "WATCHING",
): LibraryItem {
  return {
    id,
    contentId: id,
    contentType,
    playlistId: source.id,
    title: id,
    streamUrl: `https://provider.example/${id}.m3u8`,
    status,
    positionMillis: 30_000,
    durationMillis: 120_000,
    updatedAt: 1,
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("settings user actions", () => {
  it("links to both API key pages and opens them through the desktop handler", async () => {
    const user = userEvent.setup();
    const onOpenExternalUrl = vi.fn(async () => undefined);
    render(
      <SettingsPage
        {...settingsProps}
        onOpenExternalUrl={onOpenExternalUrl}
        onSaveMdblistApiKey={vi.fn(async () => undefined)}
      />,
    );

    const opensubtitlesLink = screen.getByRole("link", { name: "Get an OpenSubtitles API key" });
    const mdblistLink = screen.getByRole("link", { name: "Get an MDBList API key" });
    expect(opensubtitlesLink.getAttribute("href")).toBe("https://www.opensubtitles.com/en/consumers");
    expect(mdblistLink.getAttribute("href")).toBe("https://mdblist.com/preferences/#api");
    await user.click(opensubtitlesLink);
    await user.click(mdblistLink);
    expect(onOpenExternalUrl).toHaveBeenNthCalledWith(1, "https://www.opensubtitles.com/en/consumers");
    expect(onOpenExternalUrl).toHaveBeenNthCalledWith(2, "https://mdblist.com/preferences/#api");
  });

  it("includes an external ratings menu link when MDBList settings are available", () => {
    render(<SettingsPage {...settingsProps} onSaveMdblistApiKey={vi.fn(async () => undefined)} />);

    const link = screen.getByRole("link", { name: "External ratings" });
    expect(link.getAttribute("href")).toBe("#settings-ratings");
    expect(document.getElementById("settings-ratings")).toBeTruthy();
  });

  it("routes source, appearance, and guide controls to their actions", async () => {
    const user = userEvent.setup();
    const props = {
      ...settingsProps,
      onChooseTheme: vi.fn(),
      onActivate: vi.fn(),
      onAddSource: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onRefreshEpg: vi.fn(async () => undefined),
      onRefreshSource: vi.fn(),
    };
    render(<SettingsPage {...props} />);

    await user.click(screen.getByRole("button", { name: "Light" }));
    await user.click(screen.getByRole("button", { name: "Use" }));
    await user.click(screen.getByRole("button", { name: "Edit Living room" }));
    await user.click(screen.getByRole("button", { name: "Delete Living room" }));
    await user.click(screen.getByRole("button", { name: "Add another source" }));
    await user.click(screen.getByRole("button", { name: "Refresh source" }));
    await user.click(screen.getByRole("button", { name: "Refresh TV guide" }));

    expect(props.onChooseTheme).toHaveBeenCalledWith("light");
    expect(props.onActivate).toHaveBeenCalledWith("other-source");
    expect(props.onEdit).toHaveBeenCalledWith(source);
    expect(props.onDelete).toHaveBeenCalledWith(source);
    expect(props.onAddSource).toHaveBeenCalledTimes(1);
    expect(props.onRefreshSource).toHaveBeenCalledTimes(1);
    expect(props.onRefreshEpg).toHaveBeenCalledTimes(1);
  });

  it("saves a subtitle key and updates the adult-content preference", async () => {
    const user = userEvent.setup();
    const props = {
      ...settingsProps,
      onSaveApiKey: vi.fn(async () => undefined),
      onSetShowAdultContent: vi.fn(),
    };
    render(<SettingsPage {...props} />);

    await user.click(screen.getByRole("checkbox", { name: /Show adult content/ }));
    await user.type(screen.getByPlaceholderText("Paste your personal API key"), "test-api-key");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    expect(props.onSetShowAdultContent).toHaveBeenCalledWith(true);
    expect(props.onSaveApiKey).toHaveBeenCalledWith("test-api-key");
    expect((await screen.findByRole("status")).textContent).toContain("OpenSubtitles API key saved on this device.");
  });
});

describe("playlist dialog user actions", () => {
  it("connects an M3U source and presents progress while its catalog is saved", async () => {
    const user = userEvent.setup();
    let finishConnect!: () => void;
    let submittedDraft: PlaylistDraft | undefined;
    const onConnect = vi.fn(async (draft: PlaylistDraft) => {
      submittedDraft = draft;
      draft.onStage?.("saving");
      draft.onProgress?.(1, 2);
      await new Promise<void>((resolve) => { finishConnect = resolve; });
    });
    const onClose = vi.fn();
    render(<PlaylistDialog onClose={onClose} onConnect={onConnect} />);

    await user.type(screen.getByLabelText(/Playlist name/), "Living room");
    await user.type(screen.getByLabelText(/Playlist URL/), "https://provider.example/live.m3u");
    await user.click(screen.getByRole("button", { name: "Connect source" }));
    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));

    expect(submittedDraft?.playlist).toMatchObject({
      name: "Living room",
      type: "M3U",
      url: "https://provider.example/live.m3u",
    });
    expect(screen.getByRole("status").textContent).toContain("Saving playlist data locally");
    expect(screen.getByRole("progressbar", { name: "Saving imported content" }).getAttribute("aria-valuenow")).toBe("1");
    expect((screen.getByRole("button", { name: "Saving playlist… 50%" }) as HTMLButtonElement).disabled)
      .toBe(true);

    finishConnect();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("reports missing required Xtream credentials before connecting", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn(async () => undefined);
    render(<PlaylistDialog onClose={vi.fn()} onConnect={onConnect} />);

    await user.click(screen.getByRole("button", { name: "Xtream account" }));
    await user.type(screen.getByLabelText(/Provider server URL/), "https://provider.example");
    await user.click(screen.getByRole("button", { name: "Connect source" }));

    expect(onConnect).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Username/) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/Password/) as HTMLInputElement).required).toBe(true);
  });

  it("closes the source dialog on Escape", async () => {
    const onClose = vi.fn();
    render(<PlaylistDialog onClose={onClose} onConnect={vi.fn(async () => undefined)} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("playlist deletion progress", () => {
  it("announces record progress and then shows the library refresh phase", () => {
    const { rerender } = render(
      <PlaylistDeletionProgress completed={0} name="Living room" phase="preparing" total={0} />,
    );

    expect(screen.getByRole("dialog", { name: "Preparing playlist deletion" })).toBeTruthy();
    expect(screen.getByText(/Checking the local data linked to “Living room”/)).toBeTruthy();

    rerender(
      <PlaylistDeletionProgress completed={500} name="Living room" phase="deleting" total={1_000} />,
    );

    expect(screen.getByRole("dialog", { name: "Deleting playlist" })).toBeTruthy();
    expect(screen.getByText(/500 of 1,000 records deleted/)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Playlist deletion progress" }).getAttribute("aria-valuenow"))
      .toBe("500");
    expect(screen.getByRole("progressbar", { name: "Playlist deletion progress" }).firstElementChild?.getAttribute("style"))
      .toContain("width: 50%");

    rerender(<PlaylistDeletionProgress completed={1_000} name="Living room" phase="updating" total={1_000} />);
    expect(screen.getByRole("dialog", { name: "Updating your library" })).toBeTruthy();
    expect(screen.getByText(/loading your remaining sources/)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Library update progress" }).hasAttribute("aria-valuenow"))
      .toBe(false);
  });
});

describe("library user actions", () => {
  it("filters content, changes status, plays, and removes a saved item", async () => {
    const user = userEvent.setup();
    const items = [
      makeLibraryItem("News", "LIVE"),
      makeLibraryItem("Movie", "MOVIE"),
      { ...makeLibraryItem("Episode", "EPISODE"), parentTitle: "Series" },
    ];
    const favorites: Favorite[] = [{
      id: "series-favorite",
      contentId: "series",
      contentType: "SERIES",
      title: "Favorite series",
      playlistId: source.id,
      addedAt: 1,
    }];
    const onPlay = vi.fn();
    const onChangeStatus = vi.fn();
    const onRemove = vi.fn();
    const onRemoveFavorite = vi.fn();
    const onOpenFavorite = vi.fn();
    render(
      <LibraryPage
        favorites={favorites}
        library={items}
        onChangeStatus={onChangeStatus}
        onOpenFavorite={onOpenFavorite}
        onPlay={onPlay}
        onRemove={onRemove}
        onRemoveFavorite={onRemoveFavorite}
      />,
    );

    let contentFilters = screen.getByRole("group", { name: "Filter Continue watching by content type" });
    await user.click(within(contentFilters).getByRole("button", { name: /Movies/ }));
    expect(screen.getByText("Movie")).toBeTruthy();
    expect(screen.queryByText("News")).toBeNull();
    expect(screen.queryByText("Episode")).toBeNull();

    const statusControl = screen.getByRole("combobox", { name: "Library status for Movie" });
    await user.click(statusControl);
    await user.click(await screen.findByRole("option", { name: "Watched" }));
    expect(onChangeStatus).toHaveBeenCalledWith(items[1], "WATCHED");

    await user.click(screen.getByRole("button", { name: /Favorites/ }));
    contentFilters = screen.getByRole("group", { name: "Filter Favorites by content type" });
    await user.click(within(contentFilters).getByRole("button", { name: /Series/ }));
    expect(screen.getByText("Favorite series")).toBeTruthy();
    const favoriteThumb = screen.getByRole("button", { name: "View details for Favorite series" });
    expect(favoriteThumb.querySelector(".library-item-art-play")?.textContent).toContain("See details");
    await user.click(favoriteThumb);
    expect(onOpenFavorite).toHaveBeenCalledWith(favorites[0]);

    await user.click(screen.getByRole("button", { name: /Continue watching/ }));
    await user.click(screen.getByRole("button", { name: "Resume News" }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ title: "News", live: true }), 30_000);
    await user.click(screen.getByRole("button", { name: "Remove News from library" }));
    expect(onRemove).toHaveBeenCalledWith("News", "News");
    expect(onRemoveFavorite).not.toHaveBeenCalled();
  });
});
