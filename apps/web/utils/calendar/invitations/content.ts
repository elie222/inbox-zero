import { getCalendarInvitationIdentity } from "@/utils/calendar/invitations/parser";

export function normalizeCalendarInvitationContent(content: string) {
  // MIME parsers normalize CRLF and final newlines; Graph downloads preserve them.
  const normalized = content.replaceAll("\r\n", "\n");
  let end = normalized.length;
  while (normalized[end - 1] === "\n") end--;
  return normalized.slice(0, end);
}

export function isSameCalendarInvitation(first: string, second: string) {
  const a = normalizeCalendarInvitationContent(first);
  const b = normalizeCalendarInvitationContent(second);
  if (a === b) return true;
  // Exchange regenerates the MIME calendar part but keeps the sender's .ics
  // attachment, so copies of one invitation can differ byte-for-byte.
  const revision = getInvitationRevision(a);
  return revision !== null && revision === getInvitationRevision(b);
}

function getInvitationRevision(content: string) {
  try {
    const identity = getCalendarInvitationIdentity(content);
    if (!identity) return null;
    const { method, uid, organizer, sequence, recurrenceId } = identity;
    return JSON.stringify([method, uid, organizer, sequence, recurrenceId]);
  } catch {
    return null;
  }
}
