import { env } from "@/env";
import {
  extractEmailAddress,
  extractEmailAddresses,
  extractNameFromEmail,
  formatEmailWithName,
} from "@/utils/email";

// In prod: hello+ai@example.com
// In dev: hello+ai-test@example.com
const FILEBOT_SUFFIX = `ai${env.NODE_ENV === "development" ? "-test" : ""}`;
const FILEBOT_DISPLAY_NAME = "Inbox Zero Assistant";
// Subjects written by utils/drive/filing-notifications.ts. Matched as a fallback
// because some providers drop the Reply-To and From display name on replies.
const FILEBOT_NOTIFICATION_SUBJECT =
  /^(?:re:\s*)*(?:✓ Filed |📄 Where should I file |📄 Filing update for )/i;

/**
 * Check if any recipient in the email is a filebot reply address.
 * Pattern: user+ai@domain.com (or user+ai-test@domain.com in dev)
 * Handles multiple recipients in the To field (comma-separated).
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

  const pattern = buildFilebotPattern(localPart, domain);

  // Split by comma to handle multiple recipients in To field
  const recipients = emailToCheck.split(",");

  for (const recipient of recipients) {
    const extractedEmail = extractEmailAddress(recipient.trim());
    if (extractedEmail && pattern.test(extractedEmail)) {
      return true;
    }
  }

  return false;
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

export function getFilebotReplyTo({
  userEmail,
}: {
  userEmail: string;
}): string {
  return formatEmailWithName(
    FILEBOT_DISPLAY_NAME,
    getFilebotEmail({ userEmail }),
  );
}

export function getFilebotFrom({ userEmail }: { userEmail: string }): string {
  return formatEmailWithName(FILEBOT_DISPLAY_NAME, userEmail);
}

/**
 * Check whether an outbound message is a filebot notification email.
 * These are internal assistant-generated messages and should not be treated as
 * user-authored outbound replies for conversation status tracking.
 */
export function isFilebotNotificationMessage({
  userEmail,
  from,
  to,
  replyTo,
}: {
  userEmail: string;
  from: string;
  to: string;
  replyTo?: string;
}): boolean {
  if (
    replyTo &&
    isFilebotEmail({
      userEmail,
      emailToCheck: replyTo,
    })
  ) {
    return true;
  }

  const normalizedUserEmail = userEmail.toLowerCase();
  const fromEmail = extractEmailAddress(from)?.toLowerCase();
  if (fromEmail !== normalizedUserEmail) return false;

  const toEmails = extractEmailAddresses(to).map((email) =>
    email.toLowerCase(),
  );
  if (!toEmails.includes(normalizedUserEmail)) return false;

  const fromName = extractNameFromEmail(from).trim().toLowerCase();
  return fromName === FILEBOT_DISPLAY_NAME.toLowerCase();
}

/**
 * Check whether a thread message belongs to the user's exchange with the filing
 * assistant: a notification the app sent into the thread, or the user's reply
 * to one. Neither is a turn in the real conversation.
 */
export function isFilebotConversationMessage({
  userEmail,
  message,
}: {
  userEmail: string;
  message: {
    headers: {
      from: string;
      to: string;
      subject?: string;
      "reply-to"?: string;
    };
  };
}): boolean {
  const { from, to, subject } = message.headers;

  if (
    isFilebotNotificationMessage({
      userEmail,
      from,
      to,
      replyTo: message.headers["reply-to"],
    })
  ) {
    return true;
  }

  const normalizedUserEmail = userEmail.toLowerCase();
  if (extractEmailAddress(from)?.toLowerCase() !== normalizedUserEmail) {
    return false;
  }

  if (isFilebotEmail({ userEmail, emailToCheck: to })) return true;

  const isSelfAddressed = extractEmailAddresses(to).some(
    (email) => email.toLowerCase() === normalizedUserEmail,
  );

  return (
    isSelfAddressed && FILEBOT_NOTIFICATION_SUBJECT.test(subject?.trim() ?? "")
  );
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
