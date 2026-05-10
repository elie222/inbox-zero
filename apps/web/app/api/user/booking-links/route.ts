import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export type GetBookingLinksResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/booking-links", async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      timezone: true,
      bookingLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          isActive: true,
          durationMinutes: true,
          slotIntervalMinutes: true,
          locationType: true,
          locationValue: true,
          minimumNoticeMinutes: true,
          maxDaysAhead: true,
          timezone: true,
          destinationCalendarId: true,
          destinationCalendar: {
            select: {
              id: true,
              name: true,
              calendarId: true,
              primary: true,
            },
          },
          windows: {
            orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
            select: {
              id: true,
              weekday: true,
              startMinutes: true,
              endMinutes: true,
            },
          },
        },
      },
      calendarConnections: {
        where: { isConnected: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          provider: true,
          email: true,
          calendars: {
            orderBy: [{ primary: "desc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              primary: true,
              timezone: true,
              isEnabled: true,
            },
          },
        },
      },
    },
  });

  if (!emailAccount) throw new SafeError("User not found", 404);

  return {
    timezone: emailAccount.timezone,
    bookingLinks: emailAccount.bookingLinks,
    calendarConnections: emailAccount.calendarConnections,
  };
}
