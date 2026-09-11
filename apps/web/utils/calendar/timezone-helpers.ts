import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

/**
 * Auto-populates EmailAccount timezone from calendars if not already set
 */
export async function autoPopulateTimezone(
  emailAccountId: string,
  calendars: Array<{
    timeZone?: string | null;
    primary?: boolean | null;
    isDefaultCalendar?: boolean | null;
  }>,
  logger: Logger,
): Promise<void> {
  // Try primary calendar first (Google uses 'primary', Microsoft uses 'isDefaultCalendar')
  const primaryCalendar = calendars.find(
    (cal) => cal.primary || cal.isDefaultCalendar,
  );
  const timezoneToSet = primaryCalendar?.timeZone || calendars[0]?.timeZone;

  if (!timezoneToSet) return;

  const result = await prisma.emailAccount.updateMany({
    where: { id: emailAccountId, timezone: null },
    data: { timezone: timezoneToSet },
  });

  if (result.count === 0) return;

  logger.info("Auto-populated EmailAccount timezone", {
    emailAccountId,
    timezone: timezoneToSet,
  });
}
