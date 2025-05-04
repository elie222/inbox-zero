import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export const INTERNAL_API_KEY_HEADER = "x-api-key";

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
  if (!isValid) logger.error("Invalid API key", { invalidApiKey: apiKey });
  return isValid;
};
