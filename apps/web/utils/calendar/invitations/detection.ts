import type { ParsedMessage } from "@/utils/types";
import { GmailLabel } from "@/utils/gmail/label";
import { isCalendarInviteAttachment } from "@/utils/parse/calender-event";

export function isCalendarInvitationMessage(message: ParsedMessage) {
  if (
    message.labelIds?.includes(GmailLabel.SENT) ||
    message.isMeetingInvitation === false
  )
    return false;
  const attachments = getCalendarAttachments(message);
  if (attachments.length > 1) return false;
  return (
    !!message.calendarContent ||
    message.isMeetingInvitation === true ||
    attachments.length === 1
  );
}

export function getCalendarAttachments(message: ParsedMessage) {
  return [...(message.attachments ?? []), ...(message.inline ?? [])].filter(
    isCalendarInviteAttachment,
  );
}
