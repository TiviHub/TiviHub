// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteBackend } from "../storage/sqliteBackend";

describe("SQLite backend commands", () => {
  it("stages catalog batches and finishes with one call that carries the source update", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const backend = createSqliteBackend(async <T,>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return undefined as T;
    });
    const channels = Array.from({ length: 2500 }, (_, index) => ({ id: `c${index}`, playlistId: "p" }));
    const progress: number[] = [];

    await backend.saveCatalog({
      playlistId: "p",
      channels: channels as never,
      movies: [],
      series: [],
      onProgress: (completed) => progress.push(completed),
    });

    expect(calls.map(([command]) => command)).toEqual([
      "storage_stage", "storage_stage", "storage_stage", "storage_finish_catalog",
    ]);
    expect(calls[0][1]).toMatchObject({ storeName: "channels" });
    const finish = calls[3][1]!;
    expect(finish).toMatchObject({ playlistId: "p", sourceUpdate: null, includeEpisodes: false });
    expect(finish.generation).toBe(calls[0][1]!.generation);
    expect(progress).toEqual([1000, 2000, 2500]);
  });

  it("does not call Rust for an empty batch and reads numeric keys as text", async () => {
    const calls: string[] = [];
    const backend = createSqliteBackend(async <T,>(command: string, args?: Record<string, unknown>) => {
      calls.push(`${command}:${JSON.stringify(args)}`);
      return null as T;
    });
    await backend.tx([]);
    expect(await backend.get("subtitleFiles", 42)).toBeUndefined();
    expect(calls).toEqual(['storage_get:{"storeName":"subtitleFiles","key":"42"}']);
  });
});

describe("backend selection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@tauri-apps/api/core");
    window.localStorage.clear();
  });

  async function loadDatabase(invoke: (command: string) => Promise<unknown>) {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return import("../storage/database");
  }

  it("falls back to IndexedDB when SQLite cannot open and nothing was migrated", async () => {
    const database = await loadDatabase(async () => {
      throw new Error("locked");
    });
    await expect(database.getFavorites()).resolves.toEqual([]);
  });

  it("holds storage calls until the migration check has finished", async () => {
    let release!: (value: string) => void;
    const commands: string[] = [];
    const database = await loadDatabase(async (command) => {
      commands.push(command);
      if (command === "storage_meta_get") return new Promise((resolve) => (release = resolve as (value: string) => void));
      return command === "storage_get_all" ? "[]" : undefined;
    });

    const pending = database.getFavorites();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commands).not.toContain("storage_get_all");

    release("1");
    await expect(pending).resolves.toEqual([]);
    expect(commands).toContain("storage_get_all");
  });

  it("refuses the stale IndexedDB copy once the data has been migrated", async () => {
    window.localStorage.setItem("tivihub.storage.sqlite", "1");
    const database = await loadDatabase(async () => {
      throw new Error("locked");
    });
    await expect(database.getFavorites()).rejects.toThrow(/could not be opened/);
  });
});
