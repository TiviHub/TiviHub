import type { MdblistRateLimitState } from "./types";
import { MdblistError } from "./mdblistError";

const RATE_LIMIT_STATE_KEY = "account";

export interface MdblistRateLimitStore {
  get(): Promise<MdblistRateLimitState | undefined>;
  put(state: MdblistRateLimitState): Promise<void>;
}

export interface MdblistRateLimiter {
  acquire(): Promise<() => void>;
  recordResponse(response: Response): Promise<void>;
}

function headerNumber(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function retryAfterAt(headers: Headers, now: number): number | undefined {
  const value = headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? date : undefined;
}

function quotaError(retryAt?: number): MdblistError {
  return new MdblistError("rate-limited", "MDBList request limit reached. Try again after the rate limit resets.", 429, retryAt);
}

export function createMdblistRateLimiter(options: {
  store: MdblistRateLimitStore;
  now?: () => number;
}): MdblistRateLimiter {
  const now = options.now ?? Date.now;
  let state: MdblistRateLimitState = { key: RATE_LIMIT_STATE_KEY };
  let loaded = false;
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();
  let reserved = 0;

  async function loadState(): Promise<void> {
    if (loaded) return;
    if (!loading) {
      loading = options.store.get().then((saved) => {
        if (saved?.key === RATE_LIMIT_STATE_KEY) state = saved;
        loaded = true;
      });
    }
    await loading;
  }

  async function acquire(): Promise<() => void> {
    await loadState();
    const timestamp = now();
    if (state.retryAfterUntil !== undefined && state.retryAfterUntil > timestamp) {
      const retryAt = state.remaining === 0 && state.resetAt !== undefined
        ? Math.max(state.retryAfterUntil, state.resetAt)
        : state.retryAfterUntil;
      throw quotaError(retryAt);
    }
    if (state.remaining !== undefined && state.resetAt !== undefined && state.resetAt > timestamp
      && state.remaining - reserved <= 0) {
      throw quotaError(state.resetAt);
    }
    reserved += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      reserved = Math.max(0, reserved - 1);
    };
  }

  async function recordResponse(response: Response): Promise<void> {
    await loadState();
    const timestamp = now();
    const limit = headerNumber(response.headers, "X-RateLimit-Limit");
    const remaining = headerNumber(response.headers, "X-RateLimit-Remaining");
    const resetSeconds = headerNumber(response.headers, "X-RateLimit-Reset");
    const resetAt = resetSeconds === undefined ? undefined : resetSeconds * 1000;
    const retryAt = response.status === 429 ? retryAfterAt(response.headers, timestamp) : undefined;
    if (limit === undefined && remaining === undefined && resetAt === undefined && retryAt === undefined) return;

    const isNewWindow = resetAt !== undefined && (state.resetAt === undefined || resetAt > state.resetAt);
    const isOlderWindow = resetAt !== undefined && state.resetAt !== undefined && resetAt < state.resetAt;
    const currentWindowExpired = state.resetAt !== undefined && state.resetAt <= timestamp;
    const nextRemaining = remaining === undefined || isOlderWindow
      ? state.remaining
      : isNewWindow || currentWindowExpired || state.remaining === undefined
        ? remaining
        : Math.min(state.remaining, remaining);
    const retryAfterUntil = response.status === 429
      ? retryAt ?? state.retryAfterUntil
      : state.retryAfterUntil !== undefined && state.retryAfterUntil > timestamp
        ? state.retryAfterUntil
        : undefined;
    state = {
      key: RATE_LIMIT_STATE_KEY,
      ...(limit !== undefined ? { limit } : state.limit !== undefined ? { limit: state.limit } : {}),
      ...(nextRemaining !== undefined ? { remaining: nextRemaining } : {}),
      ...(isNewWindow
        ? { resetAt }
        : state.resetAt !== undefined
          ? { resetAt: state.resetAt }
          : resetAt !== undefined ? { resetAt } : {}),
      ...(retryAfterUntil !== undefined ? { retryAfterUntil } : {}),
    };
    const snapshot = state;
    writes = writes.catch(() => undefined).then(() => options.store.put(snapshot));
    await writes;
  }

  return { acquire, recordResponse };
}

let inMemoryRateLimitState: MdblistRateLimitState | undefined;

export let mdblistRateLimiter = createMdblistRateLimiter({
  store: {
    get: async () => inMemoryRateLimitState,
    put: async (state) => { inMemoryRateLimitState = state; },
  },
});

export function configureMdblistRateLimiter(store: MdblistRateLimitStore): void {
  mdblistRateLimiter = createMdblistRateLimiter({ store });
}
