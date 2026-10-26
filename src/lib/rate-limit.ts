import { headers } from "next/headers";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface MemoryBucket {
  timestamps: number[];
}

/**
 * In-memory sliding window store.
 * Provides microsecond L1 rate limiting per instance.
 */
const memoryStore = new Map<string, MemoryBucket>();

// Periodic garbage collection every 5 minutes to prevent memory growth
if (typeof setInterval !== "undefined") {
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryStore.entries()) {
      bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < 3600_000);
      if (bucket.timestamps.length === 0) {
        memoryStore.delete(key);
      }
    }
  }, 300_000);

  if (gcInterval.unref) {
    gcInterval.unref();
  }
}

let hasLoggedSharedStorageNotice = false;

/**
 * Extracts client IP safely from Next.js request headers.
 * Resolves x-forwarded-for, x-real-ip, or falls back to loopback identifier.
 */
export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) return realIp.trim();
  } catch {
    // Invoked outside of active Next.js HTTP request context (e.g. CLI, tests)
  }
  return "127.0.0.1";
}

/**
 * Evaluates rate limit using a sliding window algorithm.
 *
 * Architecture & Deployment note:
 * In multi-instance deployments (e.g. AWS ECS, Kubernetes, Vercel multi-region),
 * an in-memory store tracks limits independently per container/pod.
 * For global multi-instance enforcement, configure UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN. When configured, this adapter seamlessly queries
 * the distributed store. When unconfigured, it safely enforces per-node sliding limits.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // 1. If distributed Upstash Redis credentials are provided, use distributed atomic sliding window
  if (upstashUrl && upstashToken) {
    try {
      // Upstash REST Pipeline: ZREMRANGEBYSCORE -> ZADD -> ZCARD -> EXPIRE
      const pipelineUrl = `${upstashUrl.replace(/\/$/, "")}/pipeline`;
      const res = await fetch(pipelineUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["ZREMRANGEBYSCORE", key, 0, windowStart],
          ["ZADD", key, now, `${now}-${Math.random()}`],
          ["ZCARD", key],
          ["EXPIRE", key, Math.ceil(options.windowMs / 1000)],
        ]),
        cache: "no-store",
      });

      if (res.ok) {
        const results = (await res.json()) as Array<{ result: unknown }>;
        const currentCount = Number(results[2]?.result) || 1;
        const remaining = Math.max(0, options.limit - currentCount);
        const resetAt = now + options.windowMs;

        return {
          success: currentCount <= options.limit,
          limit: options.limit,
          remaining,
          resetAt,
        };
      }
    } catch {
      // Network/provider fallback: proceed to in-memory sliding window
    }
  } else if (
    process.env.NODE_ENV === "production" &&
    !hasLoggedSharedStorageNotice
  ) {
    hasLoggedSharedStorageNotice = true;
    console.info(
      "[WorkPulse Security Notice] UPSTASH_REDIS_REST_URL/TOKEN not configured. " +
        "Rate limiting is running with instance-bounded in-memory sliding window. " +
        "Configure distributed Redis for unified multi-instance clusters."
    );
  }

  // 2. In-memory sliding window enforcement
  let bucket = memoryStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    memoryStore.set(key, bucket);
  }

  // Prune timestamps outside current sliding window
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] || now;
    const resetAt = oldest + options.windowMs;
    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      resetAt,
    };
  }

  // Record this hit
  bucket.timestamps.push(now);
  const remaining = options.limit - bucket.timestamps.length;
  const resetAt = now + options.windowMs;

  return {
    success: true,
    limit: options.limit,
    remaining,
    resetAt,
  };
}

/**
 * Helper to explicitly clear rate limits for testing or administrative resets.
 */
export function resetRateLimits(): void {
  memoryStore.clear();
}
