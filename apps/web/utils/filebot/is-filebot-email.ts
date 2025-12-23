import { env } from "@/env";
import { extractEmailAddress } from "@/utils/email";

// In prod: hello+filebot@example.com
// In dev: hello+filebot-test@example.com
const FILEBOT_SUFFIX = `filebot${env.NODE_ENV === "development" ? "-test" : ""}`;

/**
 * Check if an email address is a filebot reply address.
 * Pattern: user+filebot@domain.com (or user+filebot-test@domain.com in dev)
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

  const pattern = buildFilebotPattern(localPart, domain);
  return pattern.test(extractedEmailToCheck);
}

/**
 * Generate a filebot reply-to email address.
 * Returns: user+filebot@domain.com
 */
export function getFilebotEmail({ userEmail }: { userEmail: string }): string {
  const [localPart, domain] = userEmail.split("@");
  if (!localPart || !domain) {
    throw new Error("Invalid email format");
  }
  return `${localPart}+${FILEBOT_SUFFIX}@${domain}`;
}

/**
 * Build a regex pattern for filebot emails.
 * Domain is case-insensitive (per email standards), but the filebot suffix is case-sensitive for security.
 */
function buildFilebotPattern(localPart: string, domain: string): RegExp {
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
    `^${escapeRegex(localPart)}\\+${FILEBOT_SUFFIX}@${caseInsensitiveDomain}$`,
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
