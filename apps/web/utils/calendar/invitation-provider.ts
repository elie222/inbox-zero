import prisma from "@/utils/prisma";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { CalendarInvitation } from "@/utils/calendar/invitation";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";

export async function findInvitationEvent({
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
    const params = {
      ...connection,
      connectionId: connection.id,
      emailAccountId,
      expiresAt: connection.expiresAt?.getTime() ?? null,
    };
    let provider: GoogleCalendarEventProvider | MicrosoftCalendarEventProvider;
    if (isGoogleProvider(connection.provider)) {
      provider = new GoogleCalendarEventProvider(params, logger);
    } else if (isMicrosoftProvider(connection.provider)) {
      provider = new MicrosoftCalendarEventProvider(params, logger);
    } else {
      continue;
    }
    const event = await provider.findInvitationEvent(invitation);
    if (event) matches.push({ provider, event });
  }
  if (matches.length > 1)
    throw new SafeError(
      "This invitation matches multiple calendars. Please respond from your calendar.",
    );
  return matches[0] ?? null;
}
