export function isFetchError(errorInfo: { errorMessage: string }): boolean {
  return (
    errorInfo.errorMessage === "fetch failed" ||
    errorInfo.errorMessage.includes("Unexpected end of JSON input")
  );
}
