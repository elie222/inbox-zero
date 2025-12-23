import { env } from "@/env";
import { extractEmailAddress } from "@/utils/email";

// In prod: hello+filebot-abc123@example.com
// In dev: hello+filebot-test-abc123@example.com
const FILEBOT_PREFIX = `filebot${env.NODE_ENV === "development" ? "-test" : ""}`;

/**
 * Check if an email address is a filebot reply address.
 * Pattern: user+filebot-{token}@domain.com
 */
export function isFilebotEmail({
  userEmail,
  emailToCheck,
}: {
  userEmail: string;
  emailToCheck: string;
}): boolean {
  if (!emailToCheck) return false;

  const [localPart, domain] = userEmail.split("@");
  if (!localPart || !domain) return false;

  const extractedEmailToCheck = extractEmailAddress(emailToCheck);
  if (!extractedEmailToCheck) return false;

  const pattern = buildFilebotPattern(localPart, domain, false);
  return pattern.test(extractedEmailToCheck);
}

/**
 * Generate a filebot reply-to email address with a token.
 * Returns: user+filebot-{token}@domain.com
 */
export function getFilebotEmail({
  userEmail,
  token,
}: {
  userEmail: string;
  token: string;
}): string {
  const [localPart, domain] = userEmail.split("@");
  if (!localPart || !domain) {
    throw new Error("Invalid email format");
  }
  return `${localPart}+${FILEBOT_PREFIX}-${token}@${domain}`;
}

/**
 * Extract the token from a filebot email address.
 * Returns null if not a valid filebot email.
 */
export function extractFilebotToken({
  userEmail,
  emailToCheck,
}: {
  userEmail: string;
  emailToCheck: string;
}): string | null {
  if (!emailToCheck) return null;

  const [localPart, domain] = userEmail.split("@");
  if (!localPart || !domain) return null;

  const extractedEmailToCheck = extractEmailAddress(emailToCheck);
  if (!extractedEmailToCheck) return null;

  const pattern = buildFilebotPattern(localPart, domain, true);
  const match = extractedEmailToCheck.match(pattern);
  return match ? match[1] : null;
}

/**
 * Build a regex pattern for filebot emails.
 * Domain is case-insensitive (per email standards), but the filebot prefix is case-sensitive for security.
 */
function buildFilebotPattern(
  localPart: string,
  domain: string,
  captureToken: boolean,
): RegExp {
  const tokenPattern = captureToken ? "([a-zA-Z0-9]+)" : "[a-zA-Z0-9]+";
  // Make domain case-insensitive by matching either case for each letter
  const caseInsensitiveDomain = domain
    .split("")
    .map((char) => {
      if (/[a-zA-Z]/.test(char)) {
        return `[${char.toLowerCase()}${char.toUpperCase()}]`;
      }
      return escapeRegex(char);
    })
    .join("");
  return new RegExp(
    `^${escapeRegex(localPart)}\\+${FILEBOT_PREFIX}-${tokenPattern}@${caseInsensitiveDomain}$`,
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
