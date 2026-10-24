// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStableSource } from "../hooks/useStableSource";
import type { Playlist } from "../types";

const source = (overrides: Partial<Playlist> = {}): Playlist => ({
  id: "x", name: "X", type: "XTREAM", url: "https://provider.example", username: "u", password: "p",
  active: true, drmLicenseUrl: "", drmSystem: "com.widevine.alpha", createdAt: 1, ...overrides,
});

describe("useStableSource", () => {
  it("keeps the same object while the way to reach the source is unchanged", () => {
    const first = source();
    const { result, rerender } = renderHook(({ value }) => useStableSource(value), { initialProps: { value: first } });
    rerender({ value: source({ active: false, name: "Renamed", lastCatalogRefreshOutcome: "success" }) });
    expect(result.current).toBe(first);
  });

  it("follows a change of address, login or refresh", () => {
    const { result, rerender } = renderHook(({ value }) => useStableSource(value), { initialProps: { value: source() } });
    const edited = source({ password: "other" });
    rerender({ value: edited });
    expect(result.current).toBe(edited);
    const refreshed = source({ password: "other", lastCatalogRefreshAt: 5 });
    rerender({ value: refreshed });
    expect(result.current).toBe(refreshed);
  });
});
