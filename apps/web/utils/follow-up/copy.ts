import { ThreadTrackerType } from "@/generated/prisma/enums";
import he from "he";

const SNIPPET_MAX_CHARS = 280;

export function getFollowUpCopy(trackerType: ThreadTrackerType) {
  const isAwaiting = trackerType === ThreadTrackerType.AWAITING;
  return {
    isAwaiting,
    directionLine: isAwaiting
      ? "Waiting for their reply to your sent email"
      : "You haven't replied to this email yet",
    counterpartyPrefix: isAwaiting
      ? "You sent this email to"
      : "You received this email from",
    snippetLabel: isAwaiting ? "Your sent email" : "Email awaiting your reply",
    emoji: isAwaiting ? "⏳" : "✍️",
  };
}

export function truncateSnippet(snippet: string): string {
  const collapsed = normalizeFollowUpText(snippet);
  if (collapsed.length <= SNIPPET_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, SNIPPET_MAX_CHARS - 1).trimEnd()}…`;
}

export function normalizeFollowUpText(text: string): string {
  return he.decode(text).replace(/\s+/g, " ").trim();
}
