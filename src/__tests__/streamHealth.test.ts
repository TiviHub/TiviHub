import { describe, expect, it, vi } from "vitest";
import { checkStreamAvailability, checkStreamGroupAvailability, type StreamHealthTarget } from "../services/streamHealth";

const streamUrl = "https://provider.example/live/1.m3u8";
const channels: StreamHealthTarget[] = Array.from({ length: 5 }, (_, index) => ({
  id: `channel-${index}`,
  name: `Channel ${index}`,
  streamUrl: `https://provider.example/live/${index}.m3u8`,
}));

describe("stream health checks", () => {
  it("recognizes an HLS playlist without claiming playback is guaranteed", async () => {
    const fetcher: typeof fetch = async () => new Response("#EXTM3U\n#EXT-X-VERSION:3", {
      headers: { "content-type": "text/plain" },
    });
    const result = await checkStreamAvailability(streamUrl, new AbortController().signal, fetcher);
    expect(result.status).toBe("available");
    expect(result.message).toContain("does not confirm");
  });

  it("makes a bounded credential-free range request", async () => {
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("GET");
      expect(init?.mode).toBe("cors");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-1023");
      return new Response("#EXTM3U");
    });
    await checkStreamAvailability(streamUrl, new AbortController().signal, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reports not-found streams as unavailable", async () => {
    const result = await checkStreamAvailability(
      streamUrl,
      new AbortController().signal,
      async () => new Response(null, { status: 404 }),
    );
    expect(result.status).toBe("unavailable");
  });

  it("keeps access denial and an unplayable HTTP 200 reply inconclusive", async () => {
    const denied = await checkStreamAvailability(
      streamUrl,
      new AbortController().signal,
      async () => new Response(null, { status: 403 }),
    );
    const htmlReply = await checkStreamAvailability(
      streamUrl,
      new AbortController().signal,
      async () => new Response("<html>Sign in</html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    expect(denied.status).toBe("inconclusive");
    expect(htmlReply.status).toBe("inconclusive");
  });

  it("reports browser network or CORS errors as inconclusive", async () => {
    const result = await checkStreamAvailability(
      streamUrl,
      new AbortController().signal,
      async () => { throw new TypeError("Failed to fetch"); },
    );
    expect(result.status).toBe("inconclusive");
  });

  it("reports timeout as inconclusive", async () => {
    const fetcher: typeof fetch = vi.fn((_input, init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const result = await checkStreamAvailability(streamUrl, new AbortController().signal, fetcher, 5);
    expect(result.status).toBe("inconclusive");
    expect(result.message).toContain("timed out");
  });

  it("propagates user cancellation", async () => {
    const controller = new AbortController();
    const fetcher: typeof fetch = (_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const pendingCheck = checkStreamAvailability(streamUrl, controller.signal, fetcher);
    controller.abort();
    await expect(pendingCheck).rejects.toMatchObject({ name: "AbortError" });
  });

  it("checks a group with fixed bounded concurrency and reports progress", async () => {
    let activeRequests = 0;
    let maxConcurrentRequests = 0;
    const fetcher: typeof fetch = async () => {
      activeRequests += 1;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;
      return new Response("#EXTM3U");
    };
    const progress: number[] = [];
    const results = await checkStreamGroupAvailability(
      channels,
      new AbortController().signal,
      (update) => progress.push(update.completed),
      fetcher,
    );
    expect(results).toHaveLength(channels.length);
    expect(results.map((entry) => entry.id)).toEqual(channels.map((channel) => channel.id));
    expect(maxConcurrentRequests).toBe(3);
    expect(progress).toEqual([1, 2, 3, 4, 5]);
  });

  it("cancels active group requests and does not continue queued checks", async () => {
    const controller = new AbortController();
    let requestCount = 0;
    const fetcher: typeof fetch = (_input, init) => {
      requestCount += 1;
      return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    };
    const pendingCheck = checkStreamGroupAvailability(
      channels,
      controller.signal,
      () => undefined,
      fetcher,
    );
    controller.abort();
    await expect(pendingCheck).rejects.toMatchObject({ name: "AbortError" });
    expect(requestCount).toBe(3);
  });
});
