import { isOutlookItemNotFoundError } from "@/utils/error";

/**
 * Whether the provider rejected an operation because the thread is gone, so
 * callers can tell "already handled" apart from a real failure.
 */
export function isThreadNotFoundError(error: unknown): boolean {
  if (isOutlookItemNotFoundError(error)) return true;

  return (
    error instanceof Error &&
    error.message.includes("Requested entity was not found")
  );
}
