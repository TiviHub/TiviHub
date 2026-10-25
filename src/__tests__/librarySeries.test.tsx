// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryPage } from "../components/LibraryPage";
import type { LibraryItem } from "../types";

afterEach(cleanup);

// A series has no stream of its own (its episodes do), so a watchlisted series is saved without one.
const series: LibraryItem = {
  id: "p:SERIES:s1", contentId: "s1", contentType: "SERIES", playlistId: "p", title: "Some Show",
  status: "WATCHLIST", positionMillis: 0, durationMillis: 0, updatedAt: 1,
};

describe("a series in the library", () => {
  it("opens its detail page instead of sitting disabled", async () => {
    const onOpenSeries = vi.fn();
    render(<LibraryPage
      favorites={[]}
      library={[series]}
      onAddSource={vi.fn()}
      onChangeStatus={vi.fn()}
      onOpenSeries={onOpenSeries}
      onPlay={vi.fn()}
      onRemove={vi.fn()}
      onRemoveFavorite={vi.fn()}
      sourceCount={1}
    />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Watchlist/ }));
    const card = screen.getByRole("button", { name: "Watch Some Show" });
    expect((card as HTMLButtonElement).disabled).toBe(false);
    await userEvent.setup().click(card);
    expect(onOpenSeries).toHaveBeenCalledWith(series);
  });
});
