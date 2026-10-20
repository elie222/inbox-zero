import { SafeError } from "@/utils/error";

/**
 * The text the chat stream sends to the browser when a step fails. The AI SDK
 * defaults to "An error occurred", which hides the cause. This is an allowlist:
 * a SafeError message is written for users, so it passes through. Any other
 * error's message can hold request details (URLs, keys, provider responses),
 * so only its name and status code are sent. The full error is already logged
 * in app/api/chat/route.ts.
 */
export function getStreamErrorText(error: unknown): string {
  if (!(error instanceof Error)) return "An error occurred";

  if (error instanceof SafeError) {
    return error.safeMessage || "An error occurred";
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const status =
    typeof statusCode === "number" ? ` (status ${statusCode})` : "";
  const label = error.name && error.name !== "Error" ? error.name : null;

  if (label) return `${label}${status}`;
  return `Request failed${status}`;
}
