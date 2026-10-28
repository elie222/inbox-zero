import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { getCalendarInvitation } from "@/utils/calendar/invitations/service";

export type CalendarInvitationResponse = Awaited<
  ReturnType<typeof getCalendarInvitation>
>;

export const GET = withEmailProvider(
  "messages/calendar-invitation",
  async (request) => {
    const messageId = z
      .string()
      .min(1)
      .parse(new URL(request.url).searchParams.get("messageId"));
    return NextResponse.json(
      await getCalendarInvitation({
        emailAccountId: request.auth.emailAccountId,
        email: request.auth.email,
        emailProvider: request.emailProvider,
        messageId,
        logger: request.logger,
      }),
    );
  },
);
