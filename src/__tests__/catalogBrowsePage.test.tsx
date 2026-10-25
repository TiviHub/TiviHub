// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogBrowsePage, useCatalogView } from "../components/CatalogBrowsePage";
import type { Playlist, Series } from "../types";

afterEach(cleanup);

const source = { id: "p1", type: "XTREAM" } as Playlist;
const show = (id: string, categoryId: string, category: string): Series =>
  ({ id, playlistId: "p1", name: id, seasons: 1, categoryId, category });

const browser = { categories: vi.fn(), page: vi.fn() };
// Like App: the view lives above the page, so the page can unmount (a detail opens) and come back.
function Harness({ categories, total, detail = false }: { categories: { id: string; name: string; count?: number }[]; total: number | undefined; detail?: boolean }) {
  const view = useCatalogView("p1");
  return detail ? <p>detail</p> : <CatalogBrowsePage
  view={view}
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
/>;
}
const renderPage = (categories: { id: string; name: string; count?: number }[], total: number | undefined) =>
  render(<Harness categories={categories} total={total} />);

describe("coming back from a title", () => {
  it("keeps the search you typed", () => {
    const categories = [{ id: "1", name: "Drama" }];
    const { rerender } = render(<Harness categories={categories} total={1} />);
    fireEvent.change(screen.getByPlaceholderText("Search series"), { target: { value: "abc" } });
    rerender(<Harness categories={categories} detail total={1} />);
    rerender(<Harness categories={categories} total={1} />);
    expect(screen.getByPlaceholderText("Search series")).toHaveProperty("value", "abc");
  });
});

describe("category counts", () => {
  it("counts only what is known: the source's number or the total of an opened category, never a guess", () => {
    renderPage([{ id: "1", name: "Drama" }, { id: "2", name: "Comedy" }, { id: "3", name: "Kids", count: 9 }], 5);
    expect(screen.getByRole("button", { name: /Drama/ }).textContent).toContain("5");
    expect(screen.getByRole("button", { name: /Kids/ }).textContent).toContain("9");
    // Comedy has a stored title but has not been opened: no count, not "1" and not "0".
    expect(screen.getByRole("button", { name: /Comedy/ }).textContent).toBe("Comedy");
  });
});
