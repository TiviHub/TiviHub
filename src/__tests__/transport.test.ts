// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchM3u } from "../providers/m3u";
import { proxiedUrl, providerFetch, proxyBase, usesNativeTransport } from "../providers/transport";

afterEach(() => vi.unstubAllGlobals());

function desktopWith(invoke: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("isTauri", true);
  vi.stubGlobal("__TAURI_INTERNALS__", { invoke });
}

const base64 = (text: string) => btoa(text);

describe("provider transport", () => {
  it("uses the backend only on the desktop app and only with a User-Agent", () => {
    expect(usesNativeTransport("VLC")).toBe(false);
    expect(usesNativeTransport(undefined)).toBe(false);
    desktopWith(vi.fn());
    expect(usesNativeTransport("VLC")).toBe(true);
    expect(usesNativeTransport("  ")).toBe(false);
    expect(usesNativeTransport(undefined)).toBe(false);
  });

  it("uses plain fetch without a User-Agent, even on the desktop", async () => {
    const invoke = vi.fn();
    desktopWith(invoke);
    const fetchMock = vi.fn(async () => new Response("plain"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await (await providerFetch("https://host/a.m3u")).text()).toBe("plain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends the User-Agent and the other headers through the backend and rebuilds the response", async () => {
    const invoke = vi.fn(async () => ({
      status: 200,
      headers: [["content-type", "text/plain"]],
      body: base64("#EXTM3U"),
    }));
    desktopWith(invoke);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await providerFetch("https://host/a.m3u", { headers: { Accept: "text/plain" } }, " Custom/1 ");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("http_fetch", {
      request: expect.objectContaining({
        url: "https://host/a.m3u",
        method: "GET",
        headers: [["User-Agent", "Custom/1"], ["accept", "text/plain"]],
      }),
    }, undefined);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("#EXTM3U");
  });

  it("keeps an empty or bodiless reply valid and rejects when the caller aborts", async () => {
    desktopWith(vi.fn(async () => ({ status: 204, headers: [], body: "" })));
    expect((await providerFetch("https://host/x", {}, "UA")).status).toBe(204);

    const controller = new AbortController();
    controller.abort();
    await expect(providerFetch("https://host/x", { signal: controller.signal }, "UA"))
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns a backend failure into a network error the callers already handle", async () => {
    desktopWith(vi.fn(async () => { throw "That address is not allowed."; }));
    await expect(providerFetch("https://host/x", {}, "UA")).rejects.toBeInstanceOf(TypeError);
  });

  it("downloads an M3U playlist with the playlist's User-Agent", async () => {
    const invoke = vi.fn(async () => ({ status: 200, headers: [], body: base64("#EXTM3U\n") }));
    desktopWith(invoke);

    expect(await fetchM3u("https://host/list.m3u", undefined, "Custom/1")).toBe("#EXTM3U\n");
    expect(invoke).toHaveBeenCalledWith(
      "http_fetch",
      { request: expect.objectContaining({ headers: expect.arrayContaining([["User-Agent", "Custom/1"]]) }) },
      undefined,
    );
  });
});

describe("stream proxy addresses", () => {
  it("wraps a stream address once and registers each User-Agent only once", async () => {
    const invoke = vi.fn(async () => ({ baseUrl: "http://127.0.0.1:5000/p/token" }));
    desktopWith(invoke);

    const [first, second] = await Promise.all([proxyBase("Custom/2"), proxyBase(" Custom/2 ")]);
    expect(first).toBe("http://127.0.0.1:5000/p/token");
    expect(second).toBe(first);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("proxy_register", { headers: [["User-Agent", "Custom/2"]] }, undefined);

    const wrapped = proxiedUrl(first, "https://host/a b.m3u8?x=1");
    expect(wrapped).toBe("http://127.0.0.1:5000/p/token?u=https%3A%2F%2Fhost%2Fa%20b.m3u8%3Fx%3D1");
    expect(proxiedUrl(first, wrapped)).toBe(wrapped);
  });
});
