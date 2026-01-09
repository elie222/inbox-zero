import {
  captureException as sentryCaptureException,
  setUser,
} from "@sentry/nextjs";
import { APICallError, RetryError } from "ai";
import type { FlattenedValidationErrors } from "next-safe-action";
import { createScopedLogger, type Logger } from "@/utils/logger";

export type ErrorMessage = { error: string; data?: any };
export type ZodError = {
  error: { issues: { code: string; message: string }[] };
};
export type ApiErrorType = {
  type: string;
  message?: string;
  code: number;
};

export function isError(value: any): value is ErrorMessage | ZodError {
  return value?.error;
}

export function isGmailError(
  error: unknown,
): error is { code: number; errors: { message: string }[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    Array.isArray((error as any).errors) &&
    (error as any).errors.length > 0
  );
}

export type CaptureExceptionContext = {
  // emailAccountId is set automatically via:
  // - Frontend: SentryIdentify component
  // - API routes: emailAccountMiddleware
  // - Server actions: actionClient
  // Only pass explicitly for code outside these contexts (e.g., cron jobs).
  emailAccountId?: string | null;
  userId?: string | null;
  userEmail?: string;
  extra?: Record<string, any>;
  sampleRate?: number;
};

export function captureException(
  error: unknown,
  context: CaptureExceptionContext = {},
) {
  if (isKnownApiError(error)) {
    const logger = createScopedLogger("captureException");
    logger.warn("Known API error", { error, context });
    return;
  }

  const { sampleRate, userEmail, emailAccountId, userId, extra } = context;
  if (
    Number.isFinite(sampleRate) &&
    process.env.NODE_ENV === "production" &&
    Math.random() >= (sampleRate as number)
  ) {
    return;
  }

  if (userEmail) setUser({ email: userEmail });

  const sentryExtra = {
    ...extra,
    ...(emailAccountId && { emailAccountId }),
    ...(userId && { userId }),
  };

  sentryCaptureException(error, {
    extra: Object.keys(sentryExtra).length > 0 ? sentryExtra : undefined,
  });
}

export type ActionError<E extends object = Record<string, unknown>> = {
  error: string;
} & E;
export type ServerActionResponse<
  T,
  E extends object = Record<string, unknown>,
> = ActionError<E> | T;

// This class is used to throw error messages that are safe to expose to the client.
export class SafeError extends Error {
  safeMessage?: string;
  statusCode?: number;

  constructor(safeMessage?: string, statusCode?: number) {
    super(safeMessage);
    this.name = "SafeError";
    this.safeMessage = safeMessage;
    this.statusCode = statusCode;
  }
}

export function isGmailInsufficientPermissionsError(error: unknown): boolean {
  return (error as any)?.errors?.[0]?.reason === "insufficientPermissions";
}

export function isGmailRateLimitExceededError(error: unknown): boolean {
  return (error as any)?.errors?.[0]?.reason === "rateLimitExceeded";
}

export function isGmailQuotaExceededError(error: unknown): boolean {
  return (error as any)?.errors?.[0]?.reason === "quotaExceeded";
}

export function isIncorrectOpenAIAPIKeyError(error: APICallError): boolean {
  return error.message.includes("Incorrect API key provided");
}

export function isInvalidOpenAIModelError(error: APICallError): boolean {
  return error.message.includes(
    "does not exist or you do not have access to it",
  );
}

export function isInvalidAIModelError(error: APICallError): boolean {
  // OpenAI: "The model `xyz` does not exist or you do not have access to it"
  if (
    error.message.includes("does not exist or you do not have access to it")
  ) {
    return true;
  }
  // Anthropic: 404 with "not_found_error"
  if (error.statusCode === 404 && error.message.includes("not_found_error")) {
    return true;
  }
  return false;
}

export function isOpenAIAPIKeyDeactivatedError(error: APICallError): boolean {
  return error.message.includes("this API key has been deactivated");
}

export function isAnthropicInsufficientBalanceError(
  error: APICallError,
): boolean {
  return error.message.includes(
    "Your credit balance is too low to access the Anthropic API",
  );
}

// Handling AI quota/retry errors. This can be related to the user's own API quota or the system's quota.
export function isAiQuotaExceededError(error: RetryError): boolean {
  const message = error.message.toLowerCase();
  const quotaErrorMessages = [
    "exceeded your current quota",
    "quota exceeded",
    "rate limit reached",
    "rate_limit_reached",
    "too many requests",
    "hit a rate limit",
  ];
  return quotaErrorMessages.some((substr) => message.includes(substr));
}

export function isAWSThrottlingError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.name === "ThrottlingException" &&
    (error.message?.includes("Too many requests") ||
      error.message?.includes("please wait before trying again"))
  );
}

export function isOutlookThrottlingError(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  const code = err?.code as string | undefined;
  const statusCode = err?.statusCode as number | undefined;
  const message = err?.message as string | undefined;
  return (
    statusCode === 429 ||
    code === "ApplicationThrottled" ||
    code === "TooManyRequests" ||
    (typeof message === "string" && /MailboxConcurrency/i.test(message))
  );
}

export function isAICallError(error: unknown): error is APICallError {
  return APICallError.isInstance(error);
}

export function isServiceUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ServiceUnavailableException";
}

// we don't want to capture these errors in Sentry
export function isKnownApiError(error: unknown): boolean {
  return (
    isGmailInsufficientPermissionsError(error) ||
    isGmailRateLimitExceededError(error) ||
    isGmailQuotaExceededError(error) ||
    isOutlookThrottlingError(error) ||
    (APICallError.isInstance(error) &&
      (isIncorrectOpenAIAPIKeyError(error) ||
        isInvalidAIModelError(error) ||
        isOpenAIAPIKeyDeactivatedError(error) ||
        isAnthropicInsufficientBalanceError(error))) ||
    (RetryError.isInstance(error) && isAiQuotaExceededError(error))
  );
}

export function checkCommonErrors(
  error: unknown,
  url: string,
  logger: Logger,
): ApiErrorType | null {
  if (isGmailInsufficientPermissionsError(error)) {
    logger.warn("Gmail insufficient permissions error for url", { url });
    return {
      type: "Gmail Insufficient Permissions",
      message:
        "You must grant all Gmail permissions to use the app. Please log out and log in again to grant permissions.",
      code: 403,
    };
  }

  if (isGmailRateLimitExceededError(error)) {
    logger.warn("Gmail rate limit exceeded for url", { url });
    const errorMessage =
      (error as any)?.errors?.[0]?.message ?? "Unknown error";
    return {
      type: "Gmail Rate Limit Exceeded",
      message: `Gmail error: ${errorMessage}`,
      code: 429,
    };
  }

  if (isGmailQuotaExceededError(error)) {
    logger.warn("Gmail quota exceeded for url", { url });
    return {
      type: "Gmail Quota Exceeded",
      message: "You have exceeded the Gmail quota. Please try again later.",
      code: 429,
    };
  }

  if (isOutlookThrottlingError(error)) {
    logger.warn("Outlook throttling error for url", { url });
    return {
      type: "Outlook Rate Limit",
      message:
        "Microsoft is temporarily limiting requests. Please try again shortly.",
      code: 429,
    };
  }

  if (RetryError.isInstance(error) && isAiQuotaExceededError(error)) {
    logger.warn("AI quota exceeded for url", { url });
    return {
      type: "AI Quota Exceeded",
      message: `AI error: ${error.message}`,
      code: 429,
    };
  }

  return null;
}

export function getErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  const outer = asRecord(error);
  if (!outer) return undefined;

  const directMessage = getStringProp(outer, "message");
  if (directMessage) return directMessage;

  const nested = asRecord(outer.error);
  if (!nested) return undefined;

  return getStringProp(nested, "message");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getStringProp(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

// --- Safe Action Error Handling ---

type FlattenedErrors = FlattenedValidationErrors<Record<string, string[]>>;

type SafeActionError = {
  serverError?: string;
  validationErrors?: FlattenedErrors;
  bindArgsValidationErrors?: readonly (FlattenedErrors | undefined)[];
};

type ActionErrorMessageOptions = {
  fallback?: string;
  prefix?: string;
};

/**
 * Extracts a user-friendly error message from a safe-action error result.
 * Expects flattened validation errors (defaultValidationErrorsShape: "flattened").
 *
 * @param error - The error object from safe-action
 * @param fallbackOrOptions - Either a fallback string, or options object with fallback/prefix
 *
 * @example
 * // Simple usage
 * getActionErrorMessage(error.error)
 *
 * @example
 * // With prefix (shows "Failed to save. <error>" or just "Failed to save" if no error)
 * getActionErrorMessage(error.error, { prefix: "Failed to save" })
 */
export function getActionErrorMessage(
  error: SafeActionError,
  fallbackOrOptions:
    | string
    | ActionErrorMessageOptions = "An unknown error occurred",
): string {
  const { fallback, prefix } =
    typeof fallbackOrOptions === "string"
      ? { fallback: fallbackOrOptions, prefix: undefined }
      : {
          fallback: fallbackOrOptions.fallback ?? "An unknown error occurred",
          prefix: fallbackOrOptions.prefix,
        };

  const message = extractActionErrorMessage(error);

  if (prefix) {
    return message ? `${prefix}. ${message}` : prefix;
  }

  return message || fallback;
}

function extractActionErrorMessage(error: SafeActionError): string | null {
  if (error.serverError) {
    return error.serverError;
  }

  const messages = getValidationMessages(error.validationErrors);
  if (messages) return messages;

  if (error.bindArgsValidationErrors) {
    for (const ve of error.bindArgsValidationErrors) {
      const msg = getValidationMessages(ve);
      if (msg) return msg;
    }
  }

  return null;
}

function getValidationMessages(
  errors: FlattenedErrors | undefined,
): string | null {
  if (!errors) return null;

  const { formErrors, fieldErrors } = errors;
  const all = [...formErrors, ...Object.values(fieldErrors).flat()];

  return all.length > 0 ? all.join(". ") : null;
}
