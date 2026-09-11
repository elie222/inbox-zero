import type { ParsedMessageHeaders } from "@/utils/types";
import { extractEmailAddress, splitRecipientList } from "@/utils/email";

export interface ReplyAllRecipients {
  cc: string[];
  to: string;
}

/**
 * Builds reply-all recipients by including original TO and CC recipients.
 * The reply goes to the original sender, and CC includes all other recipients.
 *
 * @param headers - Original email headers
 * @param overrideTo - Optional override for the TO field (e.g., for drafts)
 * @param currentUserEmails - Current user's email addresses to exclude from CC
 * @returns Object with TO and CC recipients for reply-all
 */
export function buildReplyAllRecipients(
  headers: ParsedMessageHeaders,
  overrideTo: string | undefined,
  currentUserEmails: string | string[],
): ReplyAllRecipients {
  // Determine the primary recipient (TO field)
  const replyToRaw = overrideTo || headers["reply-to"] || headers.from;
  const replyTo = extractEmailAddress(replyToRaw);

  const currentUserEmailSet = new Set(
    (Array.isArray(currentUserEmails) ? currentUserEmails : [currentUserEmails])
      .map((email) => extractEmailAddress(email).toLowerCase())
      .filter(Boolean),
  );

  // Build CC list for reply-all behavior
  const ccSet = new Set<string>();
  const seenEmails = new Set<string>();

  addHeaderRecipientsToCcSet({
    headerValue: headers.cc,
    replyTo,
    currentUserEmailSet,
    seenEmails,
    ccSet,
  });
  addHeaderRecipientsToCcSet({
    headerValue: headers.to,
    replyTo,
    currentUserEmailSet,
    seenEmails,
    ccSet,
  });

  return {
    to: replyToRaw, // Keep the original format for the TO field
    cc: Array.from(ccSet),
  };
}

/**
 * Converts array of CC recipients to a comma-separated string.
 * Returns undefined if the array is empty.
 */
export function formatCcList(ccList: string[]): string | undefined {
  return ccList.length > 0 ? ccList.join(", ") : undefined;
}

/**
 * Merges manual CC/BCC recipients with existing recipients,
 * ensuring deduplication and sanitization.
 */
export function mergeAndDedupeRecipients(
  existing: string[],
  manual: string | undefined,
): string[] {
  const result = [...existing];
  const seen = new Set(
    existing.map((e) => extractEmailAddress(e).toLowerCase()),
  );

  if (manual) {
    const manualEntries = splitRecipientList(manual);

    for (const entry of manualEntries) {
      const email = extractEmailAddress(entry);
      if (email) {
        const key = email.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(entry);
        }
      }
    }
  }

  return result;
}

function addHeaderRecipientsToCcSet({
  headerValue,
  replyTo,
  currentUserEmailSet,
  seenEmails,
  ccSet,
}: {
  headerValue: string | undefined;
  replyTo: string;
  currentUserEmailSet: Set<string>;
  seenEmails: Set<string>;
  ccSet: Set<string>;
}) {
  if (!headerValue) return;

  const headerEmails = splitRecipientList(headerValue)
    .map((entry) => extractEmailAddress(entry))
    .filter((email) => {
      if (!email) return false;

      const normalizedEmail = email.toLowerCase();
      return (
        normalizedEmail !== replyTo.toLowerCase() &&
        !currentUserEmailSet.has(normalizedEmail)
      );
    });

  for (const email of headerEmails) {
    const key = email.toLowerCase();
    if (!seenEmails.has(key)) {
      seenEmails.add(key);
      ccSet.add(email);
    }
  }
}
