import { describe, expect, it } from "vitest";
import { createMdblistRateLimiter, type MdblistRateLimitStore } from "../lib/mdblistRateLimit";
import type { MdblistRateLimitState } from "../types";

function setup(nowValue = 1_000_000) {
  let saved: MdblistRateLimitState | undefined;
  const store: MdblistRateLimitStore = {
    get: async () => saved,
    put: async (state) => { saved = state; },
  };
  const limiter = createMdblistRateLimiter({ store, now: () => nowValue });
  return { limiter, get saved() { return saved; } };
}

describe("MDBList shared rate limiter", () => {
  it("persists quota headers and blocks further calls after quota is exhausted", async () => {
    const context = setup();
    const { limiter } = context;
    const release = await limiter.acquire();
    await limiter.recordResponse(new Response(null, {
      headers: {
        "X-RateLimit-Limit": "1000",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "2000",
      },
    }));
    release();

    expect(context.saved).toMatchObject({ limit: 1000, remaining: 0, resetAt: 2_000_000 });
    await expect(limiter.acquire()).rejects.toMatchObject({ kind: "rate-limited", retryAt: 2_000_000 });
  });

  it("honors Retry-After from 429 responses and reserves remaining requests", async () => {
    const context = setup();
    const { limiter } = context;
    await limiter.recordResponse(new Response(null, {
      headers: { "X-RateLimit-Remaining": "1", "X-RateLimit-Reset": "2000" },
    }));
    const first = await limiter.acquire();
    await expect(limiter.acquire()).rejects.toMatchObject({ kind: "rate-limited" });
    first();
    await limiter.recordResponse(new Response(null, {
      status: 429,
      headers: { "Retry-After": "30" },
    }));

    expect(context.saved?.retryAfterUntil).toBe(1_030_000);
    await expect(limiter.acquire()).rejects.toMatchObject({ kind: "rate-limited", retryAt: 1_030_000 });
  });
});
