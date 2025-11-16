import { TZDate } from "@date-fns/tz";
import { startOfDay, endOfDay } from "date-fns";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { BusyPeriod } from "./availability-types";
import { googleAvailabilityProvider } from "./providers/google-availability";
import { microsoftAvailabilityProvider } from "./providers/microsoft-availability";

const logger = createScopedLogger("calendar/unified-availability");

/**
 * Fetch calendar availability across all connected calendars (Google and Microsoft)
 */
export async function getUnifiedCalendarAvailability({
  emailAccountId,
  startDate,
  endDate,
  timezone = "UTC",
}: {
  emailAccountId: string;
  startDate: Date;
  endDate: Date;
  timezone?: string;
}): Promise<BusyPeriod[]> {
  // Compute day boundaries in the user's timezone
  const startDateInTZ = new TZDate(startDate, timezone);
  const endDateInTZ = new TZDate(endDate, timezone);

  const timeMin = startOfDay(startDateInTZ).toISOString();
  const timeMax = endOfDay(endDateInTZ).toISOString();

  logger.trace("Unified calendar availability request", {
    timezone,
    emailAccountId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timeMin,
    timeMax,
  });

  // Fetch all calendar connections with their calendars
  const calendarConnections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
    },
    include: {
      calendars: {
        where: { isEnabled: true },
        select: {
          calendarId: true,
        },
      },
    },
  });

  if (!calendarConnections.length) {
    logger.info("No calendar connections found", { emailAccountId });
    return [];
  }

  // Group calendars by provider
  const googleConnections = calendarConnections.filter(
    (conn) => conn.provider === "google",
  );
  const microsoftConnections = calendarConnections.filter(
    (conn) => conn.provider === "microsoft",
  );

  const promises: Promise<BusyPeriod[]>[] = [];

  // Fetch Google calendar availability
  for (const connection of googleConnections) {
    const calendarIds = connection.calendars.map((cal) => cal.calendarId);
    if (!calendarIds.length) continue;

    promises.push(
      googleAvailabilityProvider
        .fetchBusyPeriods({
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          expiresAt: connection.expiresAt?.getTime() || null,
          emailAccountId,
          calendarIds,
          timeMin,
          timeMax,
        })
        .catch((error) => {
          logger.error("Error fetching Google calendar availability", {
            error,
            connectionId: connection.id,
          });
          return []; // Return empty array on error
        }),
    );
  }

  // Fetch Microsoft calendar availability
  for (const connection of microsoftConnections) {
    const calendarIds = connection.calendars.map((cal) => cal.calendarId);

    if (!calendarIds.length) {
      logger.warn("No enabled calendars for Microsoft connection", {
        connectionId: connection.id,
      });
      continue;
    }

    promises.push(
      microsoftAvailabilityProvider
        .fetchBusyPeriods({
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          expiresAt: connection.expiresAt?.getTime() || null,
          emailAccountId,
          calendarIds,
          timeMin,
          timeMax,
        })
        .catch((error) => {
          logger.error("Error fetching Microsoft calendar availability", {
            error,
            connectionId: connection.id,
          });
          return []; // Return empty array on error
        }),
    );
  }

  // Wait for all providers to return results
  const results = await Promise.all(promises);

  // Flatten and merge all busy periods
  const allBusyPeriods = results.flat();

  logger.trace("Unified calendar availability results", {
    totalBusyPeriods: allBusyPeriods.length,
    googleConnectionsCount: googleConnections.length,
    microsoftConnectionsCount: microsoftConnections.length,
  });

  return allBusyPeriods;
}
