export function getSWRFetchErrorMessage(errorData: unknown): string {
  if (errorData && typeof errorData === "object") {
    if (
      "message" in errorData &&
      typeof errorData.message === "string" &&
      errorData.message
    ) {
      return errorData.message;
    }
    if ("error" in errorData) {
      const error = errorData.error;
      if (typeof error === "string" && error) return error;
      if (
        error &&
        typeof error === "object" &&
        "issues" in error &&
        Array.isArray(error.issues)
      ) {
        const message = error.issues
          .map((issue: unknown) =>
            issue &&
            typeof issue === "object" &&
            "message" in issue &&
            typeof issue.message === "string" &&
            issue.message
              ? issue.message
              : "Validation error",
          )
          .join(", ");
        if (message) return message;
      }
    }
  }
  return "An error occurred while fetching the data.";
}
