import { CALENDAR_INVITATION_LIMITS } from "@/utils/calendar/constants";
import type { EmailProvider } from "@/utils/email/types";
import { isCalendarInviteAttachment } from "@/utils/parse/calender-event";
import { parseCalendarInvitation } from "@/utils/calendar/invitation";

export async function getInvitationFromMessage(
  emailProvider: EmailProvider,
  messageId: string,
  email: string,
) {
  const message = await emailProvider.getMessage(messageId, {
    includeCalendarContent: true,
  });
  if (message.calendarContent)
    return parseCalendarInvitation(message.calendarContent, email);
  const attachments = [
    ...(message.attachments ?? []),
    ...(message.inline ?? []),
  ].filter(isCalendarInviteAttachment);
  if (
    attachments.length !== 1 ||
    attachments[0].size > CALENDAR_INVITATION_LIMITS.content
  )
    return null;
  const attachment = await emailProvider.getAttachment(
    messageId,
    attachments[0].attachmentId,
  );
  if (
    attachment.size > CALENDAR_INVITATION_LIMITS.content ||
    attachment.data.length > CALENDAR_INVITATION_LIMITS.encoded
  )
    return null;
  return parseCalendarInvitation(
    Buffer.from(attachment.data, "base64").toString("utf8"),
    email,
  );
}
