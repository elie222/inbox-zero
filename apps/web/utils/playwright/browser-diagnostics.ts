import { redactSensitiveContent } from "@/utils/dlp/sensitive-content";

const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 2000;
const EMAIL_ADDRESS_PATTERN =
  /(?<![\p{L}\p{M}\p{N}._%+-])[\p{L}\p{M}\p{N}._%+-]+@[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)*\.\p{L}[\p{L}\p{M}\p{N}-]+(?![\p{L}\p{M}\p{N}._%+-])/giu;

export function sanitizeBrowserDiagnosticText(value: string) {
  const redacted = redactSensitiveContent(value).replaceAll(
    EMAIL_ADDRESS_PATTERN,
    "[REDACTED:EMAIL]",
  );

  return redacted.length <= MAX_DIAGNOSTIC_MESSAGE_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH)}…`;
}
