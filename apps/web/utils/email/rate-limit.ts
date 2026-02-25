import "server-only";
import { env } from "@/env";
import { redis } from "@/utils/redis";
import { createScopedLogger, type Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
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

const logger = createScopedLogger("email-rate-limit");

const RATE_LIMIT_KEY_PREFIX = "email-provider-rate-limit";
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

export type EmailProviderRateLimitProvider = EmailProvider["name"];

export type EmailProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
};

export function getProviderFromRateLimitApiErrorType(
  apiErrorType: string,
): EmailProviderRateLimitProvider | null {
  if (apiErrorType === "Gmail Rate Limit Exceeded") return "google";
  if (apiErrorType === "Outlook Rate Limit") return "microsoft";
  return null;
}

export async function recordRateLimitFromApiError({
  apiErrorType,
  error,
  emailAccountId,
  logger,
  source,
}: {
  apiErrorType: string;
  error: unknown;
  emailAccountId?: string;
  logger?: Logger;
  source?: string;
}) {
  const provider = getProviderFromRateLimitApiErrorType(apiErrorType);
  if (!provider || !emailAccountId) return null;

  try {
    await recordProviderRateLimitFromError({
      error,
      emailAccountId,
      provider,
      logger,
      source,
    });
  } catch (recordError) {
    logger?.warn("Failed to record provider rate-limit state", {
      provider,
      error: recordError instanceof Error ? recordError.message : recordError,
    });
  }

  return provider;
}

type RateLimitRecordingContext = {
  emailAccountId?: string;
  provider?: string | null;
  source?: string;
  logger?: Logger;
  attemptNumber?: number;
  onRateLimitRecorded?: (
    state: EmailProviderRateLimitState | null,
    error: unknown,
  ) => void | Promise<void>;
};

export class ProviderRateLimitModeError extends Error {
  provider: EmailProviderRateLimitProvider;
  errors?: Array<{ reason: "rateLimitExceeded"; message: string }>;
  statusCode?: number;
  code?: string;
  retryAt?: string;

  constructor({
    provider,
    retryAt,
  }: {
    provider: EmailProviderRateLimitProvider;
    retryAt?: Date;
  }) {
    const message =
      provider === "google"
        ? `Gmail is temporarily rate limiting this account. Retry after ${retryAt?.toISOString()}.`
        : `Microsoft is temporarily rate limiting this account. Retry after ${retryAt?.toISOString()}.`;

    super(message);
    this.name = "ProviderRateLimitModeError";
    this.provider = provider;
    if (provider === "google") {
      this.errors = [{ reason: "rateLimitExceeded", message }];
    } else {
      this.statusCode = 429;
      this.code = "TooManyRequests";
    }
    this.retryAt = retryAt?.toISOString();
  }
}

export function isProviderRateLimitModeError(
  error: unknown,
): error is ProviderRateLimitModeError {
  return error instanceof ProviderRateLimitModeError;
}

export async function getEmailProviderRateLimitState({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailProviderRateLimitState | null> {
  if (!hasRedisConfig) return null;

  const key = getRateLimitKey(emailAccountId);
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

  await redis.set(getRateLimitKey(emailAccountId), JSON.stringify(value), {
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

export async function assertProviderNotRateLimited({
  emailAccountId,
  provider,
  logger,
  source,
}: {
  emailAccountId: string;
  provider: EmailProviderRateLimitProvider;
  logger?: Logger;
  source?: string;
}) {
  const state = await getEmailProviderRateLimitState({ emailAccountId });
  if (!state || state.provider !== provider) return;

  logger?.warn("Skipping provider call while rate-limit mode is active", {
    emailAccountId,
    provider,
    retryAt: state.retryAt.toISOString(),
    source,
    rateLimitSource: state.source,
  });

  throw new ProviderRateLimitModeError({
    provider,
    retryAt: state.retryAt,
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

  const delayMs = getProviderRateLimitDelayMs({
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
    provider,
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
    const rateLimitProvider = toRateLimitProvider(provider);
    if (emailAccountId && rateLimitProvider) {
      try {
        rateLimitState = await recordProviderRateLimitFromError({
          error,
          emailAccountId,
          provider: rateLimitProvider,
          logger,
          source,
          attemptNumber,
        });
      } catch (recordError) {
        logger?.warn("Failed to record provider rate-limit state", {
          provider: rateLimitProvider,
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

export function getProviderRateLimitDelayMs({
  error,
  provider,
  attemptNumber,
}: {
  error: unknown;
  provider: EmailProviderRateLimitProvider;
  attemptNumber: number;
}) {
  if (provider === "google") {
    return getGoogleRateLimitDelayMs(error, attemptNumber);
  }

  return getMicrosoftRateLimitDelayMs(error, attemptNumber);
}

function getGoogleRateLimitDelayMs(error: unknown, attemptNumber: number) {
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

function getMicrosoftRateLimitDelayMs(error: unknown, attemptNumber: number) {
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

function parseStoredState(value: string): StoredProviderRateLimitState | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredProviderRateLimitState>;
    if (!parsed.retryAt || typeof parsed.retryAt !== "string") return null;
    if (Number.isNaN(new Date(parsed.retryAt).getTime())) return null;
    const provider = toRateLimitProvider(parsed.provider);
    if (!provider) return null;
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

function getRateLimitKey(emailAccountId: string) {
  return `${RATE_LIMIT_KEY_PREFIX}:${emailAccountId}`;
}

function getOutlookRetryAfterHeader(error: unknown): string | undefined {
  const err = error as Record<string, unknown>;
  const response = err?.response as Record<string, unknown> | undefined;
  const headers = response?.headers as Record<string, string> | undefined;
  return headers?.["retry-after"] ?? headers?.["Retry-After"];
}

export function toRateLimitProvider(
  provider: string | null | undefined,
): EmailProviderRateLimitProvider | null {
  if (provider === "google" || provider === "microsoft") return provider;
  return null;
}
