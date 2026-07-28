// Field-name sets shared by the logger (hashes/redacts in logs) and the Sentry
// scrubber (redacts before sending to a third party). Pure string Sets only —
// no env, no crypto — so this is safe in client and edge bundles.

// PII identifiers (correspondent addresses). Hashed in logs, redacted for
// Sentry. Deliberately does NOT include "email" — that field carries the
// authenticated user's own address in most log contexts, which AGENTS.md
// permits at any level.
export const SENSITIVE_FIELD_NAMES = new Set([
  "from",
  "sender",
  "to",
  "replyTo",
  "senderEmail",
  "cleanSenderEmail",
  "fromEmail",
  "senderName",
]);

// Secrets that must never leave the process.
export const REDACTED_FIELD_NAMES = new Set([
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "headers",
  "authorization",
  "requestBodyValues",
  "systemInstruction",
  "contents",
]);

// Email/message content.
export const CONTENT_FIELD_NAMES = new Set([
  "text",
  "body",
  "content",
  "subject",
  "textPlain",
  "textHtml",
  "snippet",
  "decodedSnippet",
]);

export function normalizeRedactionFieldName(fieldName: string) {
  return fieldName.toLowerCase().replace(/[\s_-]/g, "");
}
