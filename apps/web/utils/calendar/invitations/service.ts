import prisma from "@/utils/prisma";
import { createCalendarEventProvider } from "@/utils/calendar/event-provider";
import { CALENDAR_INVITATION_LIMITS } from "@/utils/calendar/invitations/constants";
import {
  parseCalendarInvitation,
  createCalendarReply,
  type CalendarInvitation,
  type InvitationResponse,
} from "@/utils/calendar/invitations/parser";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { isCalendarInviteAttachment } from "@/utils/parse/calender-event";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";

type InvitationContext = {
  emailAccountId: string;
  email: string;
  emailProvider: EmailProvider;
  messageId: string;
  logger: Logger;
};

export async function getCalendarInvitation({
  emailAccountId,
  email,
  emailProvider,
  messageId,
  logger,
}: InvitationContext) {
  const invitation = await getInvitationFromMessage(
    emailProvider,
    messageId,
    email,
  );
  if (!invitation) return { invitation: null };
  const match = await findInvitationEvent({
    emailAccountId,
    invitation,
    logger,
  });
  return {
    invitation: {
      title: invitation.title,
      organizer: invitation.organizer,
      recurring: invitation.recurring,
      response: match?.event.response ?? null,
      calendarSynced: !!match,
    },
  };
}

export async function respondToCalendarInvitation({
  emailAccountId,
  email,
  emailProvider,
  messageId,
  response,
  logger,
}: InvitationContext & { response: InvitationResponse }) {
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

async function getInvitationFromMessage(
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

async function findInvitationEvent({
  emailAccountId,
  invitation,
  logger,
}: {
  emailAccountId: string;
  invitation: CalendarInvitation;
  logger: Logger;
}) {
  const connections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      email: { equals: invitation.attendee, mode: "insensitive" },
    },
  });
  const matches = [];
  for (const connection of connections) {
    if (!connection.refreshToken) continue;
    if (
      !isGoogleProvider(connection.provider) &&
      !isMicrosoftProvider(connection.provider)
    )
      continue;
    const provider = createCalendarEventProvider({
      connection,
      emailAccountId,
      logger,
    });
    const event = await provider.findInvitationEvent(invitation);
    if (event) matches.push({ provider, event });
  }
  if (matches.length > 1)
    throw new SafeError(
      "This invitation matches multiple calendars. Please respond from your calendar.",
    );
  return matches[0] ?? null;
}
