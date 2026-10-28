import { GmailLabel } from "@/utils/gmail/label";

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

/**
 * A conversation is titled by its first message, as Gmail and Outlook do, so a
 * reply's "Re:" subject never renames it. Drafts and trashed messages only
 * title a conversation that has nothing else, matching the mail engine's list.
 * Expects messages oldest first.
 */
export function getConversationSubject(
  messages: Array<{ headers: { subject?: string }; labelIds?: string[] }>,
) {
  const message =
    messages.find(
      (item) =>
        !item.labelIds?.includes(GmailLabel.DRAFT) &&
        !item.labelIds?.includes(GmailLabel.TRASH),
    ) ?? messages.at(-1);
  return message?.headers.subject;
}
