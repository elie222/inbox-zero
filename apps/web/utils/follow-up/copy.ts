import { ThreadTrackerType } from "@/generated/prisma/enums";

const SNIPPET_MAX_CHARS = 280;

export function getFollowUpCopy(trackerType: ThreadTrackerType) {
  const isAwaiting = trackerType === ThreadTrackerType.AWAITING;
  return {
    isAwaiting,
    directionLine: isAwaiting ? "they haven't replied" : "you haven't replied",
    preposition: isAwaiting ? "to" : "from",
    verb: isAwaiting ? "sent" : "received",
    emoji: isAwaiting ? "⏳" : "✍️",
  };
}

export function truncateSnippet(snippet: string): string {
  const collapsed = snippet.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SNIPPET_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, SNIPPET_MAX_CHARS - 1).trimEnd()}…`;
}
