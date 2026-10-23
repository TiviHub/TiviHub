import { describe, expect, it } from "vitest";
import { isAdultContent } from "../lib/adultContent";

describe("adult content detection", () => {
  it("matches adult keywords in titles and category labels", () => {
    expect(isAdultContent("Late Night", "18+ Movies")).toBe(true);
    expect(isAdultContent("XXX Cinema")).toBe(true);
    expect(isAdultContent("Erotiek")).toBe(true);
    expect(isAdultContent("Pornography")).toBe(true);
    expect(isAdultContent("FOR_ADULT")).toBe(true);
    expect(isAdultContent("FOR ADULTS")).toBe(true);
  });

  it("matches full-width age ratings after normalization", () => {
    expect(isAdultContent("Films １８＋")).toBe(true);
  });

  it("does not match unrelated words that contain keyword letters", () => {
    expect(isAdultContent("News", "Sports and documentaries")).toBe(false);
    expect(isAdultContent("A sexy comedy")).toBe(false);
  });
});
