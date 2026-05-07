import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

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
          aliasSlug: true,
          title: true,
          description: true,
          timezone: true,
          isActive: true,
          defaultEventTypeId: true,
          eventTypes: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              durationMinutes: true,
              slotIntervalMinutes: true,
              locationType: true,
              locationValue: true,
              minimumNoticeMinutes: true,
              bufferBeforeMinutes: true,
              bufferAfterMinutes: true,
              bookingWindowDays: true,
              maxActiveBookingsPerGuest: true,
              disableCancelling: true,
              hideHostEmail: true,
              hideCalendarEventDetails: true,
              isActive: true,
              hosts: {
                where: { isActive: true },
                select: {
                  id: true,
                  emailAccountId: true,
                  scheduleId: true,
                  destinationCalendarId: true,
                  destinationCalendar: {
                    select: {
                      id: true,
                      name: true,
                      calendarId: true,
                      primary: true,
                    },
                  },
                  schedule: {
                    select: {
                      id: true,
                      name: true,
                      timezone: true,
                      rules: {
                        orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
                        select: {
                          id: true,
                          weekday: true,
                          startMinutes: true,
                          endMinutes: true,
                        },
                      },
                      dateOverrides: {
                        orderBy: { date: "asc" },
                        select: {
                          id: true,
                          date: true,
                          type: true,
                        },
                      },
                    },
                  },
                },
              },
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

  return {
    timezone: emailAccount?.timezone ?? null,
    bookingLinks: emailAccount?.bookingLinks ?? [],
    calendarConnections: emailAccount?.calendarConnections ?? [],
  };
}
