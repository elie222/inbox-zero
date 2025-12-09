import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export const INTERNAL_API_KEY_HEADER = "x-api-key";

export function getInternalApiUrl(): string {
  return env.INTERNAL_API_URL || env.NEXT_PUBLIC_BASE_URL;
}

export const isValidInternalApiKey = (
  headers: Headers,
  logger: Logger,
): boolean => {
  if (!env.INTERNAL_API_KEY) {
    logger.error("No internal API key set");
    return false;
  }
  const apiKey = headers.get(INTERNAL_API_KEY_HEADER);
  const isValid = apiKey === env.INTERNAL_API_KEY;
  if (!isValid) {
    const origin = headers.get("origin");
    const referer = headers.get("referer");
    const userAgent = headers.get("user-agent");

    logger.error("Invalid API key", {
      invalidApiKey: apiKey,
      origin,
      referer,
      userAgent,
    });
  }
  return isValid;
};
