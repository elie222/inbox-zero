import "server-only";
import { createScopedLogger, type Logger } from "@/utils/logger";
import {
  getProviderFromRateLimitApiErrorType,
  type EmailProviderRateLimitProvider,
  ProviderRateLimitModeError,
  toRateLimitProvider,
} from "@/utils/email/rate-limit-mode-error";
import {
  getEmailProviderRateLimitStateFromRedis,
  isEmailProviderRateLimitRedisConfigured,
  setEmailProviderRateLimitStateInRedis,
} from "@/utils/redis/email-provider-rate-limit";
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

const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
const MAX_RATE_LIMIT_TTL_SECONDS = 60 * 60;
const RETRY_AT_BUFFER_SECONDS = 5;

export type EmailProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
};

export {
  getEmailProviderRateLimitStateFromRedis as getEmailProviderRateLimitState,
};

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
  if (!isEmailProviderRateLimitRedisConfigured()) {
    return {
      provider,
      retryAt,
      source,
    };
  }

  const stateLogger = customLogger || logger;
  const existing = await getEmailProviderRateLimitStateFromRedis({
    emailAccountId,
  });

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

  await setEmailProviderRateLimitStateInRedis({
    emailAccountId,
    provider,
    retryAt,
    source,
    ttlSeconds,
  });

  stateLogger.warn("Set provider rate-limit mode", {
    emailAccountId,
    provider,
    retryAt: retryAt.toISOString(),
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
  const state = await getEmailProviderRateLimitStateFromRedis({
    emailAccountId,
  });
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
  if (!isEmailProviderRateLimitRedisConfigured()) return null;

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

function getOutlookRetryAfterHeader(error: unknown): string | undefined {
  const err = error as Record<string, unknown>;
  const response = err?.response as Record<string, unknown> | undefined;
  const headers = response?.headers as Record<string, string> | undefined;
  return headers?.["retry-after"] ?? headers?.["Retry-After"];
}
