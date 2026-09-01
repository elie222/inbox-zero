import { redactSensitiveContent } from "@/utils/dlp/sensitive-content";

const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 2000;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function sanitizeBrowserDiagnosticText(value: string) {
  const redacted = redactSensitiveContent(value).replaceAll(
    EMAIL_ADDRESS_PATTERN,
    "[REDACTED:EMAIL]",
  );

  return redacted.length <= MAX_DIAGNOSTIC_MESSAGE_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH)}…`;
}
