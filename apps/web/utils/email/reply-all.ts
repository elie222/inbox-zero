import type { ParsedMessageHeaders } from "@/utils/types";

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
 * @returns Object with TO and CC recipients for reply-all
 */
export function buildReplyAllRecipients(
  headers: ParsedMessageHeaders,
  overrideTo?: string,
): ReplyAllRecipients {
  // Determine the primary recipient (TO field)
  const replyTo = overrideTo || headers["reply-to"] || headers.from;

  // Build CC list for reply-all behavior
  const ccSet = new Set<string>();

  // Add original CC recipients if they exist
  if (headers.cc) {
    const originalCcAddresses = headers.cc
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => addr && addr !== replyTo);

    for (const addr of originalCcAddresses) {
      ccSet.add(addr);
    }
  }

  // Add original TO recipients to CC (excluding the reply-to address)
  if (headers.to) {
    const originalToAddresses = headers.to
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => addr && addr !== replyTo);

    for (const addr of originalToAddresses) {
      ccSet.add(addr);
    }
  }

  return {
    to: replyTo,
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
