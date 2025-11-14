import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { getRecallCalendar } from "@/utils/recall/calendar";

export type GetRecallCalendarResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const connections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      email: true,
      recallCalendarId: true,
      createdAt: true,
    },
  });

  const calendarsWithStatus = await Promise.all(
    connections.map(async (connection) => {
      let recallCalendar = null;

      if (connection.recallCalendarId) {
        try {
          recallCalendar = await getRecallCalendar(connection.recallCalendarId);
        } catch {
          recallCalendar = null;
        }
      }

      return {
        connectionId: connection.id,
        provider: connection.provider,
        email: connection.email,
        recallCalendarId: connection.recallCalendarId,
        recallCalendar,
        createdAt: connection.createdAt,
        isConnectedToRecall: !!recallCalendar,
      };
    }),
  );

  return {
    calendars: calendarsWithStatus,
    hasConnectedCalendars: calendarsWithStatus.length > 0,
    hasRecallCalendars: calendarsWithStatus.some((c) => c.isConnectedToRecall),
  };
}
