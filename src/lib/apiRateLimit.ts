/**
 * Rate Limiting for External API Keys
 * 
 * Uses an in-memory sliding window counter.
 * On Vercel serverless, each cold start resets the counters,
 * which is acceptable — it provides soft protection, not hard guarantees.
 * For production hardening, switch to Redis.
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  windowStart: number; // timestamp in ms
}

// In-memory store keyed by apiKeyId
const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute sliding window

/**
 * Check if the request is within the rate limit for the given API key.
 * 
 * @param apiKeyId - The API key's database ID
 * @param limit - Max requests per minute (from the api_keys document)
 * @returns Object with allowed flag and rate limit headers
 */
export function checkRateLimit(
  apiKeyId: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(apiKeyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // New window
    rateLimitStore.set(apiKeyId, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  // Existing window
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const resetAt = entry.windowStart + WINDOW_MS;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return { allowed: true, remaining, resetAt };
}

/**
 * Apply rate limiting to an API request.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 * Also sets standard rate limit headers on the response (call addRateLimitHeaders on success).
 */
export function applyRateLimit(
  apiKeyId: string,
  limit: number
): NextResponse | null {
  const { allowed, remaining, resetAt } = checkRateLimit(apiKeyId, limit);

  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please slow down your requests.",
        retryAfter,
        limit,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to a successful response.
 */
export function rateLimitHeaders(
  apiKeyId: string,
  limit: number
): Record<string, string> {
  const entry = rateLimitStore.get(apiKeyId);
  const remaining = entry ? Math.max(0, limit - entry.count) : limit;
  const resetAt = entry ? entry.windowStart + WINDOW_MS : Date.now() + WINDOW_MS;

  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

// Periodic cleanup of stale entries (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart >= WINDOW_MS * 5) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}
