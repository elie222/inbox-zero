export function isFetchError(errorInfo: { errorMessage: string }): boolean {
  return errorInfo.errorMessage === "fetch failed";
}
