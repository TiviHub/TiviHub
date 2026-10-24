// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogBrowsePage } from "../components/CatalogBrowsePage";
import type { Playlist, Series } from "../types";

afterEach(cleanup);

const source = { id: "p1", type: "XTREAM" } as Playlist;
const show = (id: string, categoryId: string, category: string): Series =>
  ({ id, playlistId: "p1", name: id, seasons: 1, categoryId, category });

const browser = { categories: vi.fn(), page: vi.fn() };
const renderPage = (categories: { id: string; name: string; count?: number }[], total: number | undefined) => render(<CatalogBrowsePage
  favorites={[]}
  library={[]}
  onAddToLibrary={vi.fn()}
  onOpen={vi.fn()}
  onToggleFavorite={vi.fn()}
  section="Series"
  showAdultContent
  source={source}
  storedItems={[show("a", "1", "Drama"), show("c", "2", "Comedy")]}
  useItems={() => ({
    browser, supportsAll: false, categoryId: "1", categoriesLoading: false, categoriesError: undefined,
    categories, items: [], total, hasMore: false, loading: false, error: undefined, loadMore: vi.fn(), retry: vi.fn(),
  })}
/>);

describe("category counts", () => {
  it("counts only what is known: the source's number or the total of an opened category, never a guess", () => {
    renderPage([{ id: "1", name: "Drama" }, { id: "2", name: "Comedy" }, { id: "3", name: "Kids", count: 9 }], 5);
    expect(screen.getByRole("button", { name: /Drama/ }).textContent).toContain("5");
    expect(screen.getByRole("button", { name: /Kids/ }).textContent).toContain("9");
    // Comedy has a stored title but has not been opened: no count, not "1" and not "0".
    expect(screen.getByRole("button", { name: /Comedy/ }).textContent).toBe("Comedy");
  });
});
