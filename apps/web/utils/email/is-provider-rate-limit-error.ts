import { extractErrorInfo, isRetryableError } from "@/utils/gmail/retry";
import {
  isProviderRateLimitModeError,
  toRateLimitProvider,
} from "@/utils/email/rate-limit-mode-error";
import {
  extractErrorInfo as extractOutlookErrorInfo,
  isRetryableError as isOutlookRetryableError,
} from "@/utils/microsoft/retry";

export function isEmailProviderRateLimitError({
  error,
  provider,
}: {
  error: unknown;
  provider?: string | null;
}) {
  if (isProviderRateLimitModeError(error)) return true;

  const rateLimitProvider = toRateLimitProvider(provider);
  if (rateLimitProvider === "google") {
    return isRetryableError(extractErrorInfo(error)).isRateLimit;
  }
  if (rateLimitProvider === "microsoft") {
    return isOutlookRetryableError(extractOutlookErrorInfo(error)).isRateLimit;
  }

  return false;
}
