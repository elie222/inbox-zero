import "server-only";
import { env } from "@/env";
import { redis } from "@/utils/redis";
import { createScopedLogger, type Logger } from "@/utils/logger";
import {
  calculateRetryDelay,
  extractErrorInfo,
  getRetryAfterHeader,
  isRetryableError,
} from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail-rate-limit");

const GMAIL_RATE_LIMIT_KEY_PREFIX = "gmail-rate-limit";
const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
const MAX_RATE_LIMIT_TTL_SECONDS = 60 * 60;
const RETRY_AT_BUFFER_SECONDS = 5;
const hasRedisConfig =
  env.NODE_ENV === "test" ||
  !!(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);

type StoredGmailRateLimitState = {
  retryAt: string;
  source?: string;
  detectedAt: string;
};

export type GmailRateLimitState = {
  retryAt: Date;
  source?: string;
};

type RateLimitRecordingContext = {
  emailAccountId?: string;
  source?: string;
  logger?: Logger;
  attemptNumber?: number;
  onRateLimitRecorded?: (
    state: GmailRateLimitState | null,
    error: unknown,
  ) => void | Promise<void>;
};

export class GmailRateLimitModeError extends Error {
  errors: Array<{ reason: "rateLimitExceeded"; message: string }>;
  retryAt?: string;

  constructor({
    message,
    retryAt,
  }: {
    message: string;
    retryAt?: Date;
  }) {
    super(message);
    this.name = "GmailRateLimitModeError";
    this.errors = [{ reason: "rateLimitExceeded", message }];
    this.retryAt = retryAt?.toISOString();
  }
}

export function isGmailRateLimitModeError(
  error: unknown,
): error is GmailRateLimitModeError {
  return error instanceof GmailRateLimitModeError;
}

export async function getGmailRateLimitState({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<GmailRateLimitState | null> {
  if (!hasRedisConfig) return null;

  const key = getGmailRateLimitKey(emailAccountId);
  const value = await redis.get<string>(key);
  if (!value) return null;

  const parsed = parseStoredState(value);
  if (!parsed) {
    await redis.del(key);
    return null;
  }

  const retryAt = new Date(parsed.retryAt);
  if (retryAt.getTime() <= Date.now()) {
    await redis.del(key);
    return null;
  }

  return {
    retryAt,
    source: parsed.source,
  };
}

export async function setGmailRateLimitState({
  emailAccountId,
  retryAt,
  source,
  logger: customLogger,
}: {
  emailAccountId: string;
  retryAt: Date;
  source?: string;
  logger?: Logger;
}): Promise<GmailRateLimitState> {
  if (!hasRedisConfig) {
    return {
      retryAt,
      source,
    };
  }

  const stateLogger = customLogger || logger;
  const existing = await getGmailRateLimitState({ emailAccountId });

  if (
    existing &&
    existing.retryAt.getTime() >= retryAt.getTime() &&
    existing.source === source
  ) {
    return existing;
  }

  const delayMs = Math.max(0, retryAt.getTime() - Date.now());
  const ttlSeconds = Math.min(
    Math.max(
      Math.ceil(delayMs / 1000) + RETRY_AT_BUFFER_SECONDS,
      RETRY_AT_BUFFER_SECONDS,
    ),
    MAX_RATE_LIMIT_TTL_SECONDS,
  );

  const value: StoredGmailRateLimitState = {
    retryAt: retryAt.toISOString(),
    source,
    detectedAt: new Date().toISOString(),
  };

  await redis.set(getGmailRateLimitKey(emailAccountId), JSON.stringify(value), {
    ex: ttlSeconds,
  });

  stateLogger.warn("Set Gmail rate-limit mode", {
    emailAccountId,
    retryAt: value.retryAt,
    source,
    ttlSeconds,
  });

  return {
    retryAt,
    source,
  };
}

export async function assertGmailNotRateLimited({
  emailAccountId,
  logger,
  source,
}: {
  emailAccountId: string;
  logger?: Logger;
  source?: string;
}) {
  const state = await getGmailRateLimitState({ emailAccountId });
  if (!state) return;

  logger?.warn("Skipping Gmail call while rate-limit mode is active", {
    emailAccountId,
    retryAt: state.retryAt.toISOString(),
    source,
    rateLimitSource: state.source,
  });

  throw new GmailRateLimitModeError({
    message: `Gmail is temporarily rate limiting this account. Retry after ${state.retryAt.toISOString()}.`,
    retryAt: state.retryAt,
  });
}

export async function recordGmailRateLimitFromError({
  error,
  emailAccountId,
  logger,
  source,
  attemptNumber = 1,
}: {
  error: unknown;
  emailAccountId: string;
  logger?: Logger;
  source?: string;
  attemptNumber?: number;
}): Promise<GmailRateLimitState | null> {
  if (!hasRedisConfig) return null;

  const delayMs = getRateLimitDelayMs(error, attemptNumber);
  if (!delayMs) return null;

  const retryAt = new Date(Date.now() + delayMs);
  return setGmailRateLimitState({
    emailAccountId,
    retryAt,
    source,
    logger,
  });
}

export async function withRateLimitRecording<T>(
  {
    emailAccountId,
    source,
    logger,
    attemptNumber = 1,
    onRateLimitRecorded,
  }: RateLimitRecordingContext,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const rateLimitState = emailAccountId
      ? await recordGmailRateLimitFromError({
          error,
          emailAccountId,
          logger,
          source,
          attemptNumber,
        })
      : null;
    if (onRateLimitRecorded) {
      await onRateLimitRecorded(rateLimitState, error);
    }
    throw error;
  }
}

function getRateLimitDelayMs(error: unknown, attemptNumber: number) {
  const errorInfo = extractErrorInfo(error);
  const { isRateLimit } = isRetryableError(errorInfo);
  if (!isRateLimit) return null;

  const delayMs = calculateRetryDelay(
    true,
    false,
    false,
    attemptNumber,
    getRetryAfterHeader(error),
    errorInfo.errorMessage,
  );

  return delayMs > 0 ? delayMs : DEFAULT_RATE_LIMIT_DELAY_MS;
}

function parseStoredState(value: string): StoredGmailRateLimitState | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredGmailRateLimitState>;
    if (!parsed.retryAt || typeof parsed.retryAt !== "string") return null;
    if (Number.isNaN(new Date(parsed.retryAt).getTime())) return null;
    return {
      retryAt: parsed.retryAt,
      source: parsed.source,
      detectedAt: parsed.detectedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function getGmailRateLimitKey(emailAccountId: string) {
  return `${GMAIL_RATE_LIMIT_KEY_PREFIX}:${emailAccountId}`;
}
