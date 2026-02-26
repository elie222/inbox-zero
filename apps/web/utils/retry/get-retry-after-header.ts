export function getRetryAfterHeaderFromError(
  error: unknown,
): string | undefined {
  const err = toRecord(error);
  const cause = toRecord(err.cause);

  const directHeader = getHeaderValue(toRecord(err.response).headers);
  if (directHeader) return directHeader;

  return getHeaderValue(toRecord(cause.response).headers);
}

function getHeaderValue(headers: unknown): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const maybeHeaders = headers as {
    get?: (name: string) => string | null;
  };
  if (typeof maybeHeaders.get === "function") {
    const value =
      maybeHeaders.get("retry-after") ?? maybeHeaders.get("Retry-After");
    if (typeof value === "string" && value.trim()) return value;
  }

  for (const [key, value] of Object.entries(toRecord(headers))) {
    if (key.toLowerCase() !== "retry-after") continue;
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}
