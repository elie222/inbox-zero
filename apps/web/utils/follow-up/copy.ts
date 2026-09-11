import { ThreadTrackerType } from "@/generated/prisma/enums";
import he from "he";

const SNIPPET_MAX_CHARS = 1800;

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

export function truncateSnippet(
  snippet: string,
  maxChars = SNIPPET_MAX_CHARS,
): string {
  const normalized = normalizeFollowUpSnippet(snippet);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function normalizeFollowUpText(text: string): string {
  return he.decode(text).replace(/\s+/g, " ").trim();
}

function normalizeFollowUpSnippet(text: string): string {
  return he
    .decode(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
