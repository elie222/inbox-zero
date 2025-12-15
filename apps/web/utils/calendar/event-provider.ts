import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { CalendarEventProvider } from "@/utils/calendar/event-types";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";

const logger = createScopedLogger("calendar/event-provider");

/**
 * Create calendar event providers for all connected calendars.
 * Fetches calendar connections once and creates providers that can be reused.
 */
export async function createCalendarEventProviders(
  emailAccountId: string,
): Promise<CalendarEventProvider[]> {
  const connections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  if (connections.length === 0) {
    logger.info("No calendar connections found", { emailAccountId });
    return [];
  }

  const providers: CalendarEventProvider[] = [];

  for (const connection of connections) {
    if (!connection.refreshToken) continue;

    try {
      if (connection.provider === "google") {
        providers.push(
          new GoogleCalendarEventProvider({
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            expiresAt: connection.expiresAt?.getTime() ?? null,
            emailAccountId,
          }),
        );
      } else if (connection.provider === "microsoft") {
        providers.push(
          new MicrosoftCalendarEventProvider({
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            expiresAt: connection.expiresAt?.getTime() ?? null,
            emailAccountId,
          }),
        );
      }
    } catch (error) {
      logger.error("Failed to create calendar event provider", {
        provider: connection.provider,
        error,
      });
    }
  }

  return providers;
}
