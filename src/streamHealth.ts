export type StreamHealthStatus = "available" | "unavailable" | "inconclusive";

export interface StreamHealthResult {
  status: StreamHealthStatus;
  message: string;
}

export interface StreamHealthTarget {
  id: string;
  name: string;
  streamUrl: string;
}

export interface StreamHealthEntryResult extends StreamHealthResult {
  id: string;
  name: string;
}

export interface StreamHealthProgress {
  completed: number;
  total: number;
  results: StreamHealthEntryResult[];
}

const CHECK_TIMEOUT_MILLIS = 8_000;
const GROUP_CHECK_CONCURRENCY = 3;

function abortError(): DOMException {
  return new DOMException("The stream check was cancelled.", "AbortError");
}

function result(status: StreamHealthStatus, message: string): StreamHealthResult {
  return { status, message };
}

async function readResponsePrefix(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  try {
    const { value } = await reader.read();
    return value ? new TextDecoder().decode(value.subarray(0, 4096)).trimStart() : "";
  } finally {
    await reader.cancel();
  }
}

async function cancelUnreadResponseBody(response: Response): Promise<void> {
  if (response.body && !response.bodyUsed) await response.body.cancel();
}

export async function checkStreamAvailability(
  streamUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMillis = CHECK_TIMEOUT_MILLIS,
): Promise<StreamHealthResult> {
  if (signal.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMillis);

  try {
    const response = await fetcher(streamUrl, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { Range: "bytes=0-1023" },
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 410 || response.status >= 500) {
      await cancelUnreadResponseBody(response);
      return result("unavailable", "The provider reports that this stream is unavailable right now.");
    }
    if (response.status === 401 || response.status === 403) {
      await cancelUnreadResponseBody(response);
      return result("inconclusive", "The provider denied this check or may require access. The stream may still work.");
    }
    if (!response.ok) {
      await cancelUnreadResponseBody(response);
      return result("inconclusive", "The provider responded, but the stream could not be verified. Try playback directly.");
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("mpegurl")) {
      await cancelUnreadResponseBody(response);
      return result("available", "The provider returned an HLS playlist. This does not confirm that your device can play it.");
    }
    if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
      await cancelUnreadResponseBody(response);
      return result("available", "The provider returned media data. This does not confirm that your device can play it.");
    }
    if ((await readResponsePrefix(response)).startsWith("#EXTM3U")) {
      return result("available", "The provider returned an HLS playlist. This does not confirm that your device can play it.");
    }
    return result("inconclusive", "The provider responded, but its reply did not confirm a playable stream. Try playback directly.");
  } catch (cause) {
    if (signal.aborted) throw abortError();
    if (timedOut) {
      return result("inconclusive", "The check timed out. The stream may still work; try playback directly.");
    }
    if (cause instanceof TypeError) {
      return result("inconclusive", "This browser could not read the provider response. The stream may still work.");
    }
    return result("inconclusive", "The check could not be completed. The stream may still work; try playback directly.");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abortFromCaller);
  }
}

export async function checkStreamGroupAvailability(
  targets: readonly StreamHealthTarget[],
  signal: AbortSignal,
  onProgress: (progress: StreamHealthProgress) => void,
  fetcher: typeof fetch = fetch,
  timeoutMillis = CHECK_TIMEOUT_MILLIS,
): Promise<StreamHealthEntryResult[]> {
  const results: (StreamHealthEntryResult | undefined)[] = Array.from({ length: targets.length });
  let nextIndex = 0;

  async function checkNext(): Promise<void> {
    while (true) {
      if (signal.aborted) throw abortError();
      const index = nextIndex++;
      if (index >= targets.length) return;
      const target = targets[index];
      const outcome = await checkStreamAvailability(target.streamUrl, signal, fetcher, timeoutMillis);
      if (signal.aborted) throw abortError();
      results[index] = { id: target.id, name: target.name, ...outcome };
      const completedResults = results.filter(
        (entry): entry is StreamHealthEntryResult => entry !== undefined,
      );
      onProgress({
        completed: completedResults.length,
        total: targets.length,
        results: completedResults,
      });
    }
  }

  const workerCount = Math.min(GROUP_CHECK_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => checkNext()));
  return results.filter((entry): entry is StreamHealthEntryResult => entry !== undefined);
}
