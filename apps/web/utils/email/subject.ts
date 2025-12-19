/**
 * Formats a subject line for a reply email.
 * Adds "Re:" prefix if not already present (case-insensitive).
 * Per RFC 5322, replies should use a single "Re:" prefix, not stacked.
 */
export function formatReplySubject(subject: string): string {
  const trimmed = (subject ?? "").trim();
  // Avoid "Re: " with no subject
  if (!trimmed) {
    return "Re: (no subject)";
  }
  // Avoid duplicate "Re:" prefix (case-insensitive check)
  if (/^re:/i.test(trimmed)) {
    return trimmed;
  }
  return `Re: ${trimmed}`;
}
