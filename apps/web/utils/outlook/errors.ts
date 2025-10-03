// Helper functions for checking Outlook API errors

/**
 * Check if an error indicates that a resource already exists
 * (e.g., folder, filter, category, etc.)
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
