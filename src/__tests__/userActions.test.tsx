// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { LibraryPage } from "../components/LibraryPage";
import { TooltipLayer } from "../components/common";
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
  downloadDirectoryPath: null,
  completedDownloadCount: 0,
  onChangeDownloadDirectory: vi.fn(),
  onClearCompletedDownloads: vi.fn(),
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

async function openSettingsGroup(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name }));
}

describe("settings user actions", () => {
  it("exposes download-folder configuration in its own settings section", async () => {
    const user = userEvent.setup();
    const onChangeDownloadDirectory = vi.fn();
    const onClearCompletedDownloads = vi.fn();
    render(
      <>
        <TooltipLayer />
        <SettingsPage
          {...settingsProps}
          completedDownloadCount={2}
          onChangeDownloadDirectory={onChangeDownloadDirectory}
          onClearCompletedDownloads={onClearCompletedDownloads}
        />
      </>,
    );

    const editButton = screen.getByRole("button", { name: "Edit Living room" });
    const removeButton = screen.getByRole("button", { name: "Delete Living room" });
    expect(editButton.getAttribute("data-tooltip")).toBe("Edit playlist");
    expect(removeButton.getAttribute("data-tooltip")).toBe("Remove playlist");
    await user.hover(editButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Edit playlist");
    await user.unhover(editButton);
    await user.hover(removeButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Remove playlist");
    await user.unhover(removeButton);
    await openSettingsGroup(user, "Downloads");
    expect(screen.getByText("No additional folder selected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Living room" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Change folder" }));
    expect(onChangeDownloadDirectory).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Clear completed downloads" }));
    expect(onClearCompletedDownloads).toHaveBeenCalledOnce();
  });

  it("shows the selected download folder path", () => {
    const downloadDirectoryPath = "C:\\Users\\Amir\\Downloads";
    render(<SettingsPage {...settingsProps} downloadDirectoryPath={downloadDirectoryPath} />);
    expect(screen.getByText(downloadDirectoryPath)).toBeTruthy();
  });

  it("shows playlist expiry as a date and time", () => {
    const expiresAtMillis = Date.now() - 60_000;
    const formattedExpiry = new Date(expiresAtMillis).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
    render(
      <SettingsPage
        {...settingsProps}
        sources={[{ ...source, expiresAtMillis }]}
      />,
    );

    expect(screen.getByText(`M3U · Expired ${formattedExpiry}`)).toBeTruthy();
  });

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

    await openSettingsGroup(user, "Subtitles");
    const opensubtitlesLink = screen.getByRole("link", { name: "Get an OpenSubtitles API key" });
    expect(opensubtitlesLink.getAttribute("href")).toBe("https://www.opensubtitles.com/en/consumers");
    await user.click(opensubtitlesLink);
    await openSettingsGroup(user, "External ratings");
    const mdblistLink = screen.getByRole("link", { name: "Get an MDBList API key" });
    expect(mdblistLink.getAttribute("href")).toBe("https://mdblist.com/preferences/#api");
    await user.click(mdblistLink);
    expect(onOpenExternalUrl).toHaveBeenNthCalledWith(1, "https://www.opensubtitles.com/en/consumers");
    expect(onOpenExternalUrl).toHaveBeenNthCalledWith(2, "https://mdblist.com/preferences/#api");
  });

  it("includes an external ratings entry when MDBList settings are available", async () => {
    const user = userEvent.setup();
    render(<SettingsPage {...settingsProps} onSaveMdblistApiKey={vi.fn(async () => undefined)} />);

    await openSettingsGroup(user, "External ratings");
    expect(document.getElementById("settings-ratings")?.hidden).toBe(false);
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

    await user.click(screen.getByRole("button", { name: "Use" }));
    await user.click(screen.getByRole("button", { name: "Edit Living room" }));
    await user.click(screen.getByRole("button", { name: "Delete Living room" }));
    await user.click(screen.getByRole("button", { name: "Add another source" }));
    await user.click(screen.getByRole("button", { name: "Refresh source" }));
    await user.click(screen.getByRole("button", { name: "Refresh TV guide" }));
    await openSettingsGroup(user, "Appearance");
    await user.click(screen.getByRole("button", { name: "Light" }));

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

    await openSettingsGroup(user, "Adult content");
    await user.click(screen.getByRole("checkbox", { name: /Show adult content/ }));
    await openSettingsGroup(user, "Subtitles");
    await user.type(screen.getByPlaceholderText("Paste your personal API key"), "test-api-key");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    expect(props.onSetShowAdultContent).toHaveBeenCalledWith(true);
    expect(props.onSaveApiKey).toHaveBeenCalledWith("test-api-key");
    expect((await screen.findByRole("status")).textContent).toContain("OpenSubtitles API key saved on this device.");
  });
});

describe("shared tooltip behavior", () => {
  it("hides a sidebar tooltip on pointer exit even when its button remains focused", async () => {
    const user = userEvent.setup();
    render(
      <>
        <TooltipLayer />
        <aside className="sidebar">
          <button aria-label="Home" data-tooltip="Home" type="button">Home</button>
        </aside>
      </>,
    );
    const homeButton = screen.getByRole("button", { name: "Home" });

    await user.hover(homeButton);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    await user.click(homeButton);
    await user.unhover(homeButton);

    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
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

  it("warns that an HTTP source address is unencrypted, but not an HTTPS one", async () => {
    const user = userEvent.setup();
    render(<PlaylistDialog onClose={vi.fn()} onConnect={vi.fn(async () => undefined)} />);
    const url = screen.getByLabelText(/Playlist URL/);

    await user.type(url, "https://provider.example/live.m3u");
    expect(screen.queryByText(/unencrypted \(HTTP\)/)).toBeNull();

    await user.clear(url);
    await user.type(url, "http://provider.example/live.m3u");
    expect(screen.getByText(/unencrypted \(HTTP\)/)).toBeTruthy();
  });

  it("offers a User-Agent field only in the desktop app and saves it with the source", async () => {
    const user = userEvent.setup();
    const web = render(<PlaylistDialog onClose={vi.fn()} onConnect={vi.fn(async () => undefined)} />);
    expect(screen.queryByLabelText(/User-Agent/)).toBeNull();
    web.unmount();

    vi.stubGlobal("isTauri", true);
    try {
      let submittedDraft: PlaylistDraft | undefined;
      const onConnect = vi.fn(async (draft: PlaylistDraft) => { submittedDraft = draft; });
      render(<PlaylistDialog onClose={vi.fn()} onConnect={onConnect} />);

      await user.type(screen.getByLabelText(/Playlist name/), "Living room");
      await user.type(screen.getByLabelText(/Playlist URL/), "https://provider.example/live.m3u");
      await user.type(screen.getByLabelText(/User-Agent/), "VLC/3.0.20");
      await user.click(screen.getByRole("button", { name: "Connect source" }));

      await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
      expect(submittedDraft?.playlist.userAgent).toBe("VLC/3.0.20");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("offers Stalker portals only in the desktop app and saves a normalised MAC address", async () => {
    const user = userEvent.setup();
    const web = render(<PlaylistDialog onClose={vi.fn()} onConnect={vi.fn(async () => undefined)} />);
    expect(screen.queryByRole("button", { name: "Stalker portal" })).toBeNull();
    web.unmount();

    vi.stubGlobal("isTauri", true);
    try {
      let submittedDraft: PlaylistDraft | undefined;
      const onConnect = vi.fn(async (draft: PlaylistDraft) => { submittedDraft = draft; });
      render(<PlaylistDialog onClose={vi.fn()} onConnect={onConnect} />);

      await user.click(screen.getByRole("button", { name: "Stalker portal" }));
      await user.type(screen.getByLabelText(/Portal URL/), "http://portal.example/c/");
      await user.type(screen.getByLabelText(/MAC address/), "not a mac");
      await user.click(screen.getByRole("button", { name: "Connect source" }));
      expect(onConnect).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toMatch(/MAC address/);

      await user.clear(screen.getByLabelText(/MAC address/));
      await user.type(screen.getByLabelText(/MAC address/), "00-1a-79-12-34-56");
      await user.click(screen.getByRole("button", { name: "Connect source" }));
      await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
      expect(submittedDraft?.playlist).toMatchObject({
        type: "STALKER",
        url: "http://portal.example/c/",
        macAddress: "00:1A:79:12:34:56",
      });
    } finally {
      vi.unstubAllGlobals();
    }
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

async function chooseContentFilter(user: ReturnType<typeof userEvent.setup>, tab: string, name: RegExp) {
  await user.click(screen.getByRole("combobox", { name: `Filter ${tab} by content type` }));
  await user.click(await screen.findByRole("option", { name }));
}

async function expectNoLiveFilter(user: ReturnType<typeof userEvent.setup>, tab: string, present: boolean) {
  await user.click(screen.getByRole("combobox", { name: `Filter ${tab} by content type` }));
  const live = screen.queryByRole("option", { name: /Live TV/ });
  expect(Boolean(live)).toBe(present);
  await user.keyboard("{Escape}");
}

describe("library user actions", () => {
  it("filters content, changes status, plays, and removes a saved item", async () => {
    const user = userEvent.setup();
    const items = [
      makeLibraryItem("News", "LIVE", "WATCHED"),
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
      <>
        <TooltipLayer />
        <LibraryPage
          favorites={favorites}
          library={items}
          sourceCount={1}
          onAddSource={vi.fn()}
          onChangeStatus={onChangeStatus}
          onOpenFavorite={onOpenFavorite}
          onPlay={onPlay}
          onRemove={onRemove}
          onRemoveFavorite={onRemoveFavorite}
        />
      </>,
    );

    expect(screen.queryByText("News")).toBeNull();
    await chooseContentFilter(user, "Continue watching", /Movies/);
    expect(screen.getByText("Movie")).toBeTruthy();
    expect(screen.queryByText("News")).toBeNull();
    expect(screen.queryByText("Episode")).toBeNull();

    const statusControl = screen.getByRole("combobox", { name: "Library status for Movie" });
    await user.click(statusControl);
    await user.click(await screen.findByRole("option", { name: "Watched" }));
    expect(onChangeStatus).toHaveBeenCalledWith(items[1], "WATCHED");

    await user.click(screen.getByRole("button", { name: /Favorites/ }));
    await chooseContentFilter(user, "Favorites", /Series/);
    expect(screen.getByText("Favorite series")).toBeTruthy();
    const removeFavoriteButton = screen.getByRole("button", { name: "Remove Favorite series from favorites" });
    expect(removeFavoriteButton.getAttribute("data-tooltip")).toBe("Remove from favorites");
    await user.hover(removeFavoriteButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Remove from favorites");
    await user.unhover(removeFavoriteButton);
    const favoriteThumb = screen.getByRole("button", { name: "View details for Favorite series" });
    await user.click(favoriteThumb);
    expect(onOpenFavorite).toHaveBeenCalledWith(favorites[0]);

    await user.click(screen.getByRole("button", { name: /Continue watching/ }));
    await user.click(screen.getByRole("button", { name: "Resume Movie" }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ title: "Movie", live: false }), 30_000);
    const removeLibraryButton = screen.getByRole("button", { name: "Remove Movie from library" });
    expect(removeLibraryButton.getAttribute("data-tooltip")).toBe("Remove from library");
    await user.hover(removeLibraryButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Remove from library");
    await user.click(removeLibraryButton);
    expect(onRemove).toHaveBeenCalledWith("Movie", "Movie");
    expect(onRemoveFavorite).not.toHaveBeenCalled();
  });

  it("shows the add-source panel when no playlist exists", async () => {
    const user = userEvent.setup();
    const onAddSource = vi.fn();
    render(
      <LibraryPage
        favorites={[]}
        library={[]}
        sourceCount={0}
        onAddSource={onAddSource}
        onChangeStatus={vi.fn()}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onRemoveFavorite={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add your first source" })).toBeTruthy();
    expect(document.querySelector(".home-empty .home-empty-panel")).toBeTruthy();
    expect(document.querySelector(".library-page")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Add source/ }));
    expect(onAddSource).toHaveBeenCalledOnce();
  });

  it("keeps the panels and an empty message when a playlist exists", () => {
    render(
      <LibraryPage
        favorites={[]}
        library={[]}
        sourceCount={1}
        onAddSource={vi.fn()}
        onChangeStatus={vi.fn()}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onRemoveFavorite={vi.fn()}
      />,
    );

    expect(screen.getByText("Nothing in progress")).toBeTruthy();
  });

  it("narrows the library by title", async () => {
    const user = userEvent.setup();
    render(
      <LibraryPage
        favorites={[]}
        library={[makeLibraryItem("Alpha", "MOVIE"), makeLibraryItem("Beta", "MOVIE")]}
        sourceCount={1}
        onAddSource={vi.fn()}
        onChangeStatus={vi.fn()}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onRemoveFavorite={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search titles"), "alp");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
    await user.clear(screen.getByPlaceholderText("Search titles"));
    await user.type(screen.getByPlaceholderText("Search titles"), "zzz");
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("keeps live channels only in favorites, not watch-progress tabs", async () => {
    const user = userEvent.setup();
    const liveFavorite: Favorite = {
      id: "news-favorite",
      contentId: "News",
      contentType: "LIVE",
      title: "News",
      playlistId: source.id,
      streamUrl: "https://provider.example/News.m3u8",
      addedAt: 1,
    };
    render(
      <LibraryPage
        favorites={[liveFavorite]}
        library={[
          makeLibraryItem("Movie", "MOVIE"),
          makeLibraryItem("Watchlist movie", "MOVIE", "WATCHLIST"),
          makeLibraryItem("Watched movie", "MOVIE", "WATCHED"),
          makeLibraryItem("Continue news", "LIVE", "WATCHING"),
          makeLibraryItem("Watchlist news", "LIVE", "WATCHLIST"),
          makeLibraryItem("Watched news", "LIVE", "WATCHED"),
        ]}
        sourceCount={1}
        onAddSource={vi.fn()}
        onChangeStatus={vi.fn()}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onRemoveFavorite={vi.fn()}
      />,
    );

    await expectNoLiveFilter(user, "Continue watching", false);
    expect(screen.queryByText("Continue news")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Watchlist/ }));
    expect(screen.queryByText("Watchlist news")).toBeNull();
    await expectNoLiveFilter(user, "Watchlist", false);

    await user.click(screen.getByRole("button", { name: /Watched/ }));
    expect(screen.queryByText("Watched news")).toBeNull();
    await expectNoLiveFilter(user, "Watched", false);

    await user.click(screen.getByRole("button", { name: /Favorites/ }));
    expect(screen.getByText("News")).toBeTruthy();
    await expectNoLiveFilter(user, "Favorites", true);
  });
});
