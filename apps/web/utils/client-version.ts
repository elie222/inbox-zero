const MAX_CLIENT_VERSION_LENGTH = 64;

// The header is client-controlled, so keep only characters a `<client>/<version>`
// value needs before it reaches log storage.
export function parseClientVersionHeader(
  value: string | null,
): string | undefined {
  if (!value) return;
  const sanitized = value
    .replace(/[^\w.+/-]/g, "")
    .slice(0, MAX_CLIENT_VERSION_LENGTH);
  return sanitized || undefined;
}
