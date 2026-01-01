import type { ParsedMessageHeaders } from "@/utils/types";
import { extractEmailAddress } from "@/utils/email";

export interface ReplyAllRecipients {
  to: string;
  cc: string[];
}

/**
 * Builds reply-all recipients by including original TO and CC recipients.
 * The reply goes to the original sender, and CC includes all other recipients.
 *
 * @param headers - Original email headers
 * @param overrideTo - Optional override for the TO field (e.g., for drafts)
 * @param currentUserEmail - Current user's email to exclude from CC
 * @returns Object with TO and CC recipients for reply-all
 */
export function buildReplyAllRecipients(
  headers: ParsedMessageHeaders,
  overrideTo: string | undefined,
  currentUserEmail: string,
): ReplyAllRecipients {
  // Determine the primary recipient (TO field)
  const replyToRaw = overrideTo || headers["reply-to"] || headers.from;
  const replyTo = extractEmailAddress(replyToRaw);

  // Extract current user's email
  const currentUser = extractEmailAddress(currentUserEmail);

  // Build CC list for reply-all behavior
  const ccSet = new Set<string>();
  const seenEmails = new Set<string>();

  // Add original CC recipients if they exist
  if (headers.cc) {
    const originalCcAddresses = headers.cc
      .split(",")
      .map((addr) => ({
        raw: addr.trim(),
        email: extractEmailAddress(addr.trim()),
      }))
      .filter(
        ({ email }) => email && email !== replyTo && email !== currentUser,
      );

    for (const { raw, email } of originalCcAddresses) {
      const key = email.toLowerCase();
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        ccSet.add(email);
      }
    }
  }

  // Add original TO recipients to CC (excluding the reply-to address and current user)
  if (headers.to) {
    const originalToAddresses = headers.to
      .split(",")
      .map((addr) => ({
        raw: addr.trim(),
        email: extractEmailAddress(addr.trim()),
      }))
      .filter(
        ({ email }) => email && email !== replyTo && email !== currentUser,
      );

    for (const { raw, email } of originalToAddresses) {
      const key = email.toLowerCase();
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        ccSet.add(email);
      }
    }
  }

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
    const manualEntries = manual
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

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
