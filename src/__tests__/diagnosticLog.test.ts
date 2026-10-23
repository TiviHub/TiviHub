import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sanitized diagnostic log", () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  beforeEach(() => {
    vi.resetModules();
    values.clear();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores only bounded safe request metadata", async () => {
    const { getDiagnosticLogSnapshot, recordDiagnosticFailure } = await import("../lib/diagnosticLog");

    for (let index = 0; index < 105; index += 1) {
      recordDiagnosticFailure("m3u-playlist", "http", 403);
    }

    const snapshot = getDiagnosticLogSnapshot();
    expect(snapshot.entries).toHaveLength(100);
    expect(snapshot.entries[0]).toMatchObject({
      operation: "m3u-playlist",
      kind: "http",
      httpStatus: 403,
    });
    expect(JSON.stringify(snapshot.entries)).not.toMatch(/url|credential|message|title|stack/i);
    expect(snapshot.storageAvailable).toBe(true);
  });
});
