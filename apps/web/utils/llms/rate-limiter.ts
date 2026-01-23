import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/utils/redis";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

/**
 * Check if LLM rate limiting is enabled.
 * Requires Redis to be configured.
 */
export function isRateLimitEnabled(): boolean {
  return Boolean(env.FEATURE_LLM_RATE_LIMIT && env.UPSTASH_REDIS_URL);
}

const logger = createScopedLogger("llms:rate-limiter");

/**
 * Rate limit tier determines the limits applied.
 * - core: Main Inbox Zero functionality (higher limits)
 * - plugin: Third-party plugins (lower limits to protect core)
 * - plugin_verified: Verified plugins (moderate limits)
 */
export type RateLimitTier = "core" | "plugin" | "plugin_verified";

/**
 * Rate limit configuration for a provider.
 */
interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

/**
 * Default rate limits per provider and tier.
 * These are conservative defaults - configure via env vars for your tier.
 *
 * OpenAI Usage Tiers:
 * - Tier 1: 500 RPM, 30K-200K TPM (depending on model)
 * - Tier 2: 5000 RPM, higher TPM
 *
 * We use lower defaults to leave headroom.
 */
/**
 * Default rate limits. 0 = unlimited.
 * Core is unlimited by default - only plugins are rate limited.
 */
const DEFAULT_LIMITS: Record<string, Record<RateLimitTier, RateLimitConfig>> = {
  openai: {
    core: { requestsPerMinute: 0, tokensPerMinute: 0 }, // unlimited
    plugin_verified: { requestsPerMinute: 100, tokensPerMinute: 1_000_000 },
    plugin: { requestsPerMinute: 20, tokensPerMinute: 50_000 },
  },
  anthropic: {
    core: { requestsPerMinute: 0, tokensPerMinute: 0 }, // unlimited
    plugin_verified: { requestsPerMinute: 100, tokensPerMinute: 1_000_000 },
    plugin: { requestsPerMinute: 20, tokensPerMinute: 50_000 },
  },
  google: {
    core: { requestsPerMinute: 0, tokensPerMinute: 0 }, // unlimited
    plugin_verified: { requestsPerMinute: 100, tokensPerMinute: 1_000_000 },
    plugin: { requestsPerMinute: 20, tokensPerMinute: 50_000 },
  },
  openrouter: {
    core: { requestsPerMinute: 0, tokensPerMinute: 0 }, // unlimited
    plugin_verified: { requestsPerMinute: 100, tokensPerMinute: 1_000_000 },
    plugin: { requestsPerMinute: 20, tokensPerMinute: 50_000 },
  },
  // fallback for unknown providers
  default: {
    core: { requestsPerMinute: 0, tokensPerMinute: 0 }, // unlimited
    plugin_verified: { requestsPerMinute: 100, tokensPerMinute: 1_000_000 },
    plugin: { requestsPerMinute: 20, tokensPerMinute: 50_000 },
  },
};

/**
 * Get rate limit config for a provider and tier.
 * Checks environment variables first, then falls back to defaults.
 *
 * Env var format (provider-specific):
 * - LLM_RPM_OPENAI_CORE=100
 * - LLM_TPM_OPENAI_CORE=50000
 *
 * Or generic (applies to all providers for that tier):
 * - LLM_RPM_CORE=100
 * - LLM_TPM_CORE=50000
 */
function getRateLimitConfig(
  provider: string,
  tier: RateLimitTier,
): RateLimitConfig {
  const providerUpper = provider.toUpperCase();
  const tierUpper = tier.toUpperCase();

  // check for provider-specific env var overrides first
  const rpmProviderEnvKey = `LLM_RPM_${providerUpper}_${tierUpper}`;
  const tpmProviderEnvKey = `LLM_TPM_${providerUpper}_${tierUpper}`;

  // then check for generic tier overrides
  const rpmGenericEnvKey = `LLM_RPM_${tierUpper}`;
  const tpmGenericEnvKey = `LLM_TPM_${tierUpper}`;

  const envRpm =
    process.env[rpmProviderEnvKey] || process.env[rpmGenericEnvKey];
  const envTpm =
    process.env[tpmProviderEnvKey] || process.env[tpmGenericEnvKey];

  // also check typed env vars for core tier
  const coreRpm = tier === "core" ? env.LLM_RPM_CORE : undefined;
  const coreTpm = tier === "core" ? env.LLM_TPM_CORE : undefined;

  // get defaults
  const providerDefaults =
    DEFAULT_LIMITS[provider.toLowerCase()] || DEFAULT_LIMITS.default;
  const defaults = providerDefaults[tier];

  return {
    requestsPerMinute: envRpm
      ? Number.parseInt(envRpm, 10)
      : (coreRpm ?? defaults.requestsPerMinute),
    tokensPerMinute: envTpm
      ? Number.parseInt(envTpm, 10)
      : (coreTpm ?? defaults.tokensPerMinute),
  };
}

// cache rate limiters to avoid recreating them
const rpmLimiters = new Map<string, Ratelimit>();
const tpmLimiters = new Map<string, Ratelimit>();

function getRpmLimiter(provider: string, tier: RateLimitTier): Ratelimit {
  const key = `${provider}:${tier}`;

  if (!rpmLimiters.has(key)) {
    const config = getRateLimitConfig(provider, tier);
    rpmLimiters.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.requestsPerMinute, "1m"),
        prefix: `llm:rpm:${provider}:${tier}`,
        analytics: false,
      }),
    );
  }

  return rpmLimiters.get(key)!;
}

function getTpmLimiter(provider: string, tier: RateLimitTier): Ratelimit {
  const key = `${provider}:${tier}`;

  if (!tpmLimiters.has(key)) {
    const config = getRateLimitConfig(provider, tier);
    tpmLimiters.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.tokensPerMinute, "1m"),
        prefix: `llm:tpm:${provider}:${tier}`,
        analytics: false,
      }),
    );
  }

  return tpmLimiters.get(key)!;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the request can be retried */
  retryAfterMs: number;
  /** Seconds until the request can be retried (for API responses) */
  retryAfterSeconds: number;
  remainingRequests: number;
  remainingTokens: number;
  /** Which limit was hit: 'rpm', 'tpm', or null if allowed */
  limitType: "rpm" | "tpm" | null;
}

/**
 * Check and consume rate limit quota.
 * Returns whether the request is allowed and when to retry if not.
 *
 * @param provider - AI provider name (openai, anthropic, etc.)
 * @param userId - User ID for per-user limiting
 * @param tier - Rate limit tier (core, plugin, plugin_verified)
 * @param estimatedTokens - Estimated tokens for this request (for TPM limiting)
 */
export async function checkRateLimit(
  provider: string,
  userId: string,
  tier: RateLimitTier = "core",
  estimatedTokens = 1000,
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(provider, tier);

  // 0 = unlimited, skip rate limiting entirely
  if (config.requestsPerMinute === 0 && config.tokensPerMinute === 0) {
    return {
      allowed: true,
      retryAfterMs: 0,
      retryAfterSeconds: 0,
      remainingRequests: Number.POSITIVE_INFINITY,
      remainingTokens: Number.POSITIVE_INFINITY,
      limitType: null,
    };
  }

  const identifier = `${userId}`;
  let rpmRemaining = Number.POSITIVE_INFINITY;
  let tpmRemaining = Number.POSITIVE_INFINITY;

  // check RPM (skip if 0/unlimited)
  if (config.requestsPerMinute > 0) {
    const rpmLimiter = getRpmLimiter(provider, tier);
    const rpmResult = await rpmLimiter.limit(identifier);
    rpmRemaining = rpmResult.remaining;

    if (!rpmResult.success) {
      const retryAfterMs = Math.max(0, rpmResult.reset - Date.now());
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      logger.info("RPM limit reached", {
        provider,
        userId,
        tier,
        retryAfterMs,
        retryAfterSeconds,
      });

      return {
        allowed: false,
        retryAfterMs,
        retryAfterSeconds,
        remainingRequests: 0,
        remainingTokens: tpmRemaining,
        limitType: "rpm",
      };
    }
  }

  // check TPM (skip if 0/unlimited)
  if (config.tokensPerMinute > 0) {
    const tpmLimiter = getTpmLimiter(provider, tier);
    const tpmResult = await tpmLimiter.limit(identifier, {
      rate: estimatedTokens,
    });
    tpmRemaining = tpmResult.remaining;

    if (!tpmResult.success) {
      const retryAfterMs = Math.max(0, tpmResult.reset - Date.now());
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      logger.info("TPM limit reached", {
        provider,
        userId,
        tier,
        estimatedTokens,
        retryAfterMs,
        retryAfterSeconds,
      });

      return {
        allowed: false,
        retryAfterMs,
        retryAfterSeconds,
        remainingRequests: rpmRemaining,
        remainingTokens: 0,
        limitType: "tpm",
      };
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    retryAfterSeconds: 0,
    remainingRequests: rpmRemaining,
    remainingTokens: tpmRemaining,
    limitType: null,
  };
}

/**
 * Wait for rate limit to allow the request.
 * Blocks until the request can proceed.
 *
 * @param provider - AI provider name
 * @param userId - User ID
 * @param tier - Rate limit tier
 * @param estimatedTokens - Estimated tokens for this request
 * @param maxWaitMs - Maximum time to wait (default 60s)
 */
export async function waitForRateLimit(
  provider: string,
  userId: string,
  tier: RateLimitTier = "core",
  estimatedTokens = 1000,
  maxWaitMs = 60_000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkRateLimit(
      provider,
      userId,
      tier,
      estimatedTokens,
    );

    if (result.allowed) {
      return;
    }

    // add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    const waitTime = Math.min(result.retryAfterMs + jitter, maxWaitMs);

    logger.info("Waiting for rate limit", {
      provider,
      userId,
      tier,
      waitTime,
    });

    await sleep(waitTime);
  }

  logger.warn("Rate limit wait timeout", {
    provider,
    userId,
    tier,
    maxWaitMs,
  });
}

/**
 * Estimate token count for a request.
 * This is a rough estimate - actual usage may vary.
 *
 * Rule of thumb: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  // rough estimate: 4 chars per token, rounded up
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for an LLM request based on system prompt and user prompt.
 */
export function estimateRequestTokens(
  systemPrompt?: string,
  userPrompt?: string,
  outputEstimate = 500,
): number {
  const inputTokens =
    estimateTokens(systemPrompt || "") + estimateTokens(userPrompt || "");
  // add estimated output tokens
  return inputTokens + outputEstimate;
}

/**
 * Get current rate limit status without consuming quota.
 * Useful for displaying limits in UI.
 */
export async function getRateLimitStatus(
  provider: string,
  userId: string,
  tier: RateLimitTier = "core",
): Promise<{
  rpm: { remaining: number; limit: number };
  tpm: { remaining: number; limit: number };
}> {
  const config = getRateLimitConfig(provider, tier);
  const identifier = `${userId}`;

  // peek at current state (this does consume a small amount but resets quickly)
  const rpmLimiter = getRpmLimiter(provider, tier);
  const tpmLimiter = getTpmLimiter(provider, tier);

  // note: this consumes quota, so use sparingly
  const [rpmResult, tpmResult] = await Promise.all([
    rpmLimiter.getRemaining(identifier),
    tpmLimiter.getRemaining(identifier),
  ]);

  return {
    rpm: { remaining: rpmResult.remaining, limit: config.requestsPerMinute },
    tpm: { remaining: tpmResult.remaining, limit: config.tokensPerMinute },
  };
}
