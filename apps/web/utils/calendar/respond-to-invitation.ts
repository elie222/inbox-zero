import { getInvitationFromMessage } from "@/utils/calendar/invitation-message";
import { findInvitationEvent } from "@/utils/calendar/invitation-provider";
import { createCalendarReply } from "@/utils/calendar/invitation";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { InvitationResponse } from "@/utils/calendar/invitation";

export async function respondToCalendarInvitation({
  emailAccountId,
  email,
  emailProvider,
  messageId,
  response,
  logger,
}: {
  emailAccountId: string;
  email: string;
  emailProvider: EmailProvider;
  messageId: string;
  response: InvitationResponse;
  logger: Logger;
}) {
  const invitation = await getInvitationFromMessage(
    emailProvider,
    messageId,
    email,
  );
  if (!invitation)
    throw new SafeError(
      "This email does not contain an invitation you can respond to.",
    );
  const match = await findInvitationEvent({
    emailAccountId,
    invitation,
    logger,
  });
  if (match) {
    await match.provider.respondToInvitation(
      match.event.id,
      invitation,
      response,
    );
    return { response, calendarSynced: true };
  }
  await emailProvider.sendEmail({
    to: invitation.organizer,
    subject: `Re: ${invitation.title}`,
    messageText: `Invitation response: ${response}.`,
    attachments: [
      {
        filename: "reply.ics",
        content: createCalendarReply(invitation, response),
        contentType: "text/calendar; method=REPLY; charset=UTF-8",
      },
    ],
  });
  return { response, calendarSynced: false };
}
