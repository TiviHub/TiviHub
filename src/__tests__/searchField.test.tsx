// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchField } from "../components/common";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("");
  return <SearchField label="Search movies" onChange={setValue} placeholder="Search movies" value={value} />;
}

describe("SearchField", () => {
  it("shows a clear button only while there is text, and empties the field and keeps focus on it", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    const input = screen.getByPlaceholderText("Search movies") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "matrix" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });
});
