// Helper functions for checking Microsoft Graph API errors

/**
 * Check if an error indicates that a resource already exists
 * (e.g., filter, category, etc.)
 */
export function isAlreadyExistsError(error: unknown): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: simplest
  const errorMessage = (error as any)?.message || "";
  return (
    errorMessage.includes("already exists") ||
    errorMessage.includes("duplicate") ||
    errorMessage.includes("conflict")
  );
}

/**
 * Check if a Microsoft Graph API error indicates a resource was not found.
 * GraphError from the SDK has `statusCode: number` as the canonical HTTP status.
 */
export function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object" && "statusCode" in error) {
    return (error as { statusCode: number }).statusCode === 404;
  }
  return false;
}
