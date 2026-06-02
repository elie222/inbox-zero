import type { Event } from "@sentry/nextjs";
import {
  CONTENT_FIELD_NAMES,
  normalizeRedactionFieldName,
  REDACTED_FIELD_NAMES,
  SENSITIVE_FIELD_NAMES,
} from "@/utils/redact-fields";

const REDACTED = "[redacted]";
const MAX_DEPTH = 10;

const REDACT_KEYS = new Set<string>(
  [
    ...REDACTED_FIELD_NAMES,
    ...CONTENT_FIELD_NAMES,
    ...SENSITIVE_FIELD_NAMES,
  ].map(normalizeRedactionFieldName),
);

// Sentry is a third party. Before sending an event, redact PII/secrets from the
// fields where captureException context and request data land. We redact (not
// hash) so this stays client- and edge-safe (no node:crypto). event.user.email
// is intentionally left alone: it is the authenticated user's own email, which
// the logging policy allows.
export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.extra) event.extra = redactPii(event.extra);
  if (event.contexts) event.contexts = redactPii(event.contexts);
  if (event.request) {
    const { data, headers, cookies } = event.request;
    if (data) event.request.data = redactPii(data);
    if (headers) event.request.headers = redactPii(headers);
    if (cookies) event.request.cookies = redactPii(cookies);
  }
  return event;
}

// Wired into Sentry.init as beforeSend / beforeSendTransaction across all
// runtimes. scrubSentryEvent is generic over the event type, so it instantiates
// to ErrorEvent / TransactionEvent at each call site (both share the scrubbed
// fields). Aliased rather than re-typed to avoid importing TransactionEvent,
// which @sentry/nextjs does not re-export.
export const beforeSend = scrubSentryEvent;
export const beforeSendTransaction = scrubSentryEvent;

function redactPii<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item, depth + 1)) as T;
  }

  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = REDACT_KEYS.has(normalizeRedactionFieldName(key))
      ? REDACTED
      : redactPii(nested, depth + 1);
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
