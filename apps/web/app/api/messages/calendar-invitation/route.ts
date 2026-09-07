import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { getInvitationFromMessage } from "@/utils/calendar/invitation-message";
import { findInvitationEvent } from "@/utils/calendar/invitation-provider";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

export type CalendarInvitationResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailProvider(
  "messages/calendar-invitation",
  async (request) => {
    const messageId = z
      .string()
      .min(1)
      .parse(new URL(request.url).searchParams.get("messageId"));
    return NextResponse.json(
      await getData(
        request.auth.emailAccountId,
        request.auth.email,
        messageId,
        request.emailProvider,
        request.logger,
      ),
    );
  },
);

async function getData(
  emailAccountId: string,
  email: string,
  messageId: string,
  emailProvider: EmailProvider,
  logger: Logger,
) {
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
