// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getCatalogImportLogSnapshot } from "../catalogImportLog";

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("playlist import diagnostics", () => {
  it("records only provider type, elapsed time, and parsed item counts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(screen.getByRole("button", { name: "Choose file" }));
    await user.type(screen.getByLabelText(/Playlist name/), "Private source name");
    await user.upload(
      screen.getByLabelText(/M3U file/),
      new File([
        "#EXTM3U\n" +
          '#EXTINF:-1 group-title="News",Channel One\nhttps://media.example/live.m3u8\n' +
          '#EXTINF:-1 group-title="Movies",Movie One\nhttps://media.example/movie.mp4\n',
      ], "private-playlist.m3u", { type: "audio/x-mpegurl" }),
    );
    const sourceDialog = screen.getByRole("dialog", { name: "Add a playlist" });
    expect((sourceDialog.querySelector('input[type="file"]') as HTMLInputElement).files?.length).toBe(1);
    fireEvent.submit(sourceDialog.querySelector("form")!);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a playlist" })).toBeNull());
    const [summary] = getCatalogImportLogSnapshot().entries;
    expect(summary).toMatchObject({
      provider: "M3U",
      channels: 1,
      movies: 1,
      series: 0,
      episodes: 0,
    });
    expect(summary.elapsedMillis).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(summary)).not.toMatch(/Private source name|private-playlist|media\.example/i);
  }, 30_000);

  it("tells the user how many non-HTTP streams were left out", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Opening your library" })).toBeNull());

    await user.click(screen.getAllByRole("button", { name: "Open settings" })[0]);
    await user.click(screen.getByRole("button", { name: /^Add (?:another )?source$/ }));
    await user.click(screen.getByRole("button", { name: "Choose file" }));
    await user.upload(
      screen.getByLabelText(/M3U file/),
      new File([
        [
          "#EXTM3U",
          '#EXTINF:-1 group-title="News",Channel One',
          "https://media.example/live.m3u8",
          '#EXTINF:-1 group-title="News",Radio',
          "rtmp://media.example/radio",
        ].join("\n"),
      ], "mixed.m3u", { type: "audio/x-mpegurl" }),
    );
    fireEvent.submit(screen.getByRole("dialog", { name: "Add a playlist" }).querySelector("form")!);

    expect(await screen.findByText(/1 skipped \(not HTTP or HTTPS\)/)).toBeTruthy();
  }, 30_000);
});
