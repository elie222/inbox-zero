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
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { timezone: true },
  });

  if (!emailAccount?.timezone) {
    // Try primary calendar first (Google uses 'primary', Microsoft uses 'isDefaultCalendar')
    const primaryCalendar = calendars.find(
      (cal) => cal.primary || cal.isDefaultCalendar,
    );
    const timezoneToSet = primaryCalendar?.timeZone || calendars[0]?.timeZone;

    if (timezoneToSet) {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { timezone: timezoneToSet },
      });
      logger.info("Auto-populated EmailAccount timezone", {
        emailAccountId,
        timezone: timezoneToSet,
      });
    }
  }
}
