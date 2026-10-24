import { invoke, isTauri } from "@tauri-apps/api/core";

/** A web view cannot set User-Agent, so a playlist that asks for one is requested by the desktop backend instead. */
export function usesNativeTransport(userAgent?: string): boolean {
  return isTauri() && Boolean(userAgent?.trim());
}

interface NativeResponse {
  status: number;
  headers: [string, string][];
  /** Base64. */
  body: string;
}

// Statuses that may not carry a body in a Response.
const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * `fetch` for provider requests. Without a custom User-Agent (or outside the desktop app) this is plain
 * `fetch`; with one, the request goes through the backend, which can set the header.
 */
export async function providerFetch(
  url: string,
  init: RequestInit = {},
  userAgent?: string,
): Promise<Response> {
  if (!usesNativeTransport(userAgent)) return fetch(url, init);
  if (init.signal?.aborted) throw abortError();

  const headers: [string, string][] = [["User-Agent", userAgent!.trim()]];
  new Headers(init.headers).forEach((value, name) => headers.push([name, value]));
  const request = invoke<NativeResponse>("http_fetch", {
    request: {
      url,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    },
  });
  const native = await new Promise<NativeResponse>((resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    request.then(resolve, (cause: unknown) => reject(new TypeError(String(cause))));
  });
  const body = native.body ? decodeBase64(native.body) : null;
  return new Response(NO_BODY_STATUSES.has(native.status) ? null : body, {
    status: native.status,
    headers: native.headers,
  });
}

const registrations = new Map<string, Promise<string>>();

/** Base address of a backend proxy that adds the User-Agent to every request made through it. */
export function proxyBase(userAgent: string): Promise<string> {
  const key = userAgent.trim();
  let registration = registrations.get(key);
  if (!registration) {
    registration = invoke<{ baseUrl: string }>("proxy_register", { headers: [["User-Agent", key]] })
      .then((result) => result.baseUrl);
    registration.catch(() => registrations.delete(key));
    registrations.set(key, registration);
  }
  return registration;
}

/** The address a player should load so the request carries the playlist's User-Agent. */
export function proxiedUrl(base: string, url: string): string {
  return url.startsWith(base) ? url : `${base}?u=${encodeURIComponent(url)}`;
}
