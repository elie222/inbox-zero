export function createThreadListCacheKey(query: object) {
  const entries = Object.entries(query)
    .filter(
      ([key, value]) =>
        key !== "nextPageToken" && value !== null && value !== undefined,
    )
    .map(([key, value]) => [key, normalizeValue(value)] as const)
    .sort(([first], [second]) => first.localeCompare(second));

  return `thread-list:v1:${JSON.stringify(Object.fromEntries(entries))}`;
}

export function createThreadDetailVariant(options?: {
  includeDrafts?: boolean;
  parseReplies?: boolean;
}) {
  return `drafts:${options?.includeDrafts ? 1 : 0}|replies:${options?.parseReplies ? 1 : 0}`;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value
      .map(normalizeValue)
      .sort((first, second) =>
        JSON.stringify(first).localeCompare(JSON.stringify(second)),
      );
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== null && nested !== undefined)
        .map(([key, nested]) => [key, normalizeValue(nested)] as const)
        .sort(([first], [second]) => first.localeCompare(second)),
    );
  }
  return value;
}
