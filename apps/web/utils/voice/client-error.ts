import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("voice");

export function clientVoiceError(error: unknown, fallback: string): string {
  logger.error("Voice client error", {
    error: error instanceof Error ? error.message : String(error),
  });
  return fallback;
}

export function clientVoiceApiError(
  body: { error?: unknown },
  fallback: string,
): string {
  return typeof body.error === "string" && body.error.trim()
    ? body.error
    : fallback;
}
