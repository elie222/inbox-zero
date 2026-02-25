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
import {
  calculateRetryDelay as calculateOutlookRetryDelay,
  extractErrorInfo as extractOutlookErrorInfo,
  isRetryableError as isOutlookRetryableError,
} from "@/utils/outlook/retry";

const logger = createScopedLogger("gmail-rate-limit");

const GMAIL_RATE_LIMIT_KEY_PREFIX = "gmail-rate-limit";
const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
const MAX_RATE_LIMIT_TTL_SECONDS = 60 * 60;
const RETRY_AT_BUFFER_SECONDS = 5;
const hasRedisConfig =
  env.NODE_ENV === "test" ||
  !!(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);

type StoredProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: string;
  source?: string;
  detectedAt: string;
};

export type EmailProviderRateLimitProvider = "google" | "microsoft";

export type EmailProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
};

export type GmailRateLimitState = EmailProviderRateLimitState;

type RateLimitRecordingContext = {
  emailAccountId?: string;
  provider?: EmailProviderRateLimitProvider;
  source?: string;
  logger?: Logger;
  attemptNumber?: number;
  onRateLimitRecorded?: (
    state: EmailProviderRateLimitState | null,
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
  return getEmailProviderRateLimitState({ emailAccountId });
}

export async function getEmailProviderRateLimitState({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailProviderRateLimitState | null> {
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
    provider: parsed.provider,
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
  return setEmailProviderRateLimitState({
    emailAccountId,
    provider: "google",
    retryAt,
    source,
    logger: customLogger,
  });
}

export async function setEmailProviderRateLimitState({
  emailAccountId,
  provider,
  retryAt,
  source,
  logger: customLogger,
}: {
  emailAccountId: string;
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
  logger?: Logger;
}): Promise<EmailProviderRateLimitState> {
  if (!hasRedisConfig) {
    return {
      provider,
      retryAt,
      source,
    };
  }

  const stateLogger = customLogger || logger;
  const existing = await getEmailProviderRateLimitState({ emailAccountId });

  if (
    existing &&
    existing.provider === provider &&
    existing.retryAt.getTime() >= retryAt.getTime()
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

  const value: StoredProviderRateLimitState = {
    provider,
    retryAt: retryAt.toISOString(),
    source,
    detectedAt: new Date().toISOString(),
  };

  await redis.set(getGmailRateLimitKey(emailAccountId), JSON.stringify(value), {
    ex: ttlSeconds,
  });

  stateLogger.warn("Set provider rate-limit mode", {
    emailAccountId,
    provider,
    retryAt: value.retryAt,
    source,
    ttlSeconds,
  });

  return {
    provider,
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
  return recordProviderRateLimitFromError({
    error,
    emailAccountId,
    provider: "google",
    logger,
    source,
    attemptNumber,
  });
}

export async function recordProviderRateLimitFromError({
  error,
  emailAccountId,
  provider,
  logger,
  source,
  attemptNumber = 1,
}: {
  error: unknown;
  emailAccountId: string;
  provider: EmailProviderRateLimitProvider;
  logger?: Logger;
  source?: string;
  attemptNumber?: number;
}): Promise<EmailProviderRateLimitState | null> {
  if (!hasRedisConfig) return null;

  const delayMs = getRateLimitDelayMs({
    error,
    provider,
    attemptNumber,
  });
  if (!delayMs) return null;

  const retryAt = new Date(Date.now() + delayMs);
  return setEmailProviderRateLimitState({
    emailAccountId,
    provider,
    retryAt,
    source,
    logger,
  });
}

export async function withRateLimitRecording<T>(
  {
    emailAccountId,
    provider = "google",
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
    let rateLimitState: EmailProviderRateLimitState | null = null;
    if (emailAccountId) {
      try {
        rateLimitState = await recordProviderRateLimitFromError({
          error,
          emailAccountId,
          provider,
          logger,
          source,
          attemptNumber,
        });
      } catch (recordError) {
        logger?.warn("Failed to record provider rate-limit state", {
          provider,
          source,
          error:
            recordError instanceof Error ? recordError.message : recordError,
        });
      }
    }
    if (onRateLimitRecorded) {
      await onRateLimitRecorded(rateLimitState, error);
    }
    throw error;
  }
}

function getRateLimitDelayMs({
  error,
  provider,
  attemptNumber,
}: {
  error: unknown;
  provider: EmailProviderRateLimitProvider;
  attemptNumber: number;
}) {
  if (provider === "microsoft") {
    const errorInfo = extractOutlookErrorInfo(error);
    const { isRateLimit } = isOutlookRetryableError(errorInfo);
    if (!isRateLimit) return null;

    const delayMs = calculateOutlookRetryDelay(
      true,
      false,
      false,
      attemptNumber,
      getOutlookRetryAfterHeader(error),
    );
    return delayMs > 0 ? delayMs : DEFAULT_RATE_LIMIT_DELAY_MS;
  }

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

function parseStoredState(value: string): StoredProviderRateLimitState | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredProviderRateLimitState>;
    if (!parsed.retryAt || typeof parsed.retryAt !== "string") return null;
    if (Number.isNaN(new Date(parsed.retryAt).getTime())) return null;
    const provider =
      parsed.provider === "microsoft" || parsed.provider === "google"
        ? parsed.provider
        : "google";
    return {
      provider,
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

function getOutlookRetryAfterHeader(error: unknown): string | undefined {
  const err = error as Record<string, unknown>;
  const response = err?.response as Record<string, unknown> | undefined;
  const headers = response?.headers as Record<string, string> | undefined;
  return headers?.["retry-after"] ?? headers?.["Retry-After"];
}
