export function getSWRFetchErrorMessage(
  errorData: Record<string, unknown>,
): string {
  return (
    getStringValue(errorData.message) ||
    getStructuredErrorMessage(errorData.error) ||
    "An error occurred while fetching the data."
  );
}

function getStructuredErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;

  if ("issues" in error && Array.isArray(error.issues)) {
    const messages = error.issues
      .map((issue) => getIssueMessage(issue) || "Validation error")
      .join(", ");

    return messages || null;
  }

  return null;
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getIssueMessage(issue: unknown): string | null {
  if (!issue || typeof issue !== "object") return null;
  return "message" in issue && typeof issue.message === "string"
    ? issue.message
    : null;
}
