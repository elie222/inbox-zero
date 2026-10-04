"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  connectFastmailCalendarBody,
  disconnectCalendarBody,
  toggleCalendarBody,
  updateTimezoneBody,
  updateBookingLinkBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { discoverFastmailCalendars } from "@/utils/calendar/providers/fastmail";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .inputSchema(disconnectCalendarBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.calendarConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Calendar connection not found");
      }

      await prisma.calendarConnection.delete({
        where: { id: connectionId },
      });

      return { success: true };
    },
  );

export const toggleCalendarAction = actionClient
  .metadata({ name: "toggleCalendar" })
  .inputSchema(toggleCalendarBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { calendarId, isEnabled },
    }) => {
      const updatedCalendar = await prisma.calendar.updateMany({
        where: {
          id: calendarId,
          connection: {
            emailAccountId,
          },
        },
        data: { isEnabled },
      });

      if (updatedCalendar.count === 0) {
        throw new SafeError("Calendar not found");
      }

      return { success: true };
    },
  );

export const updateEmailAccountTimezoneAction = actionClient
  .metadata({ name: "updateTimezone" })
  .inputSchema(updateTimezoneBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { timezone } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { timezone },
    });
  });

export const fillMissingTimezoneAction = actionClient
  .metadata({ name: "fillMissingTimezone" })
  .inputSchema(updateTimezoneBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { timezone } }) => {
    const result = await prisma.emailAccount.updateMany({
      where: { id: emailAccountId, timezone: null },
      data: { timezone },
    });
    return { updated: result.count > 0 };
  });

export const updateCalendarBookingLinkAction = actionClient
  .metadata({ name: "updateBookingLink" })
  .inputSchema(updateBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { bookingLink } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { calendarBookingLink: bookingLink || null },
    });
  });

export const connectFastmailCalendarAction = actionClient
  .metadata({ name: "connectFastmailCalendar" })
  .inputSchema(connectFastmailCalendarBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { email, appPassword },
    }) => {
      if (!env.NEXT_PUBLIC_FASTMAIL_ENABLED)
        throw new SafeError("Fastmail is disabled.");
      let calendars: Awaited<ReturnType<typeof discoverFastmailCalendars>>;
      try {
        calendars = await discoverFastmailCalendars({ email, appPassword });
      } catch {
        throw new SafeError(
          "Could not connect to Fastmail Calendar. Check your email and calendar app password.",
        );
      }
      if (!calendars.length)
        throw new SafeError("No Fastmail calendars found.");
      const normalizedEmail = email.toLowerCase();
      const connection = await prisma.calendarConnection.upsert({
        where: {
          emailAccountId_provider_email: {
            emailAccountId,
            provider: "fastmail",
            email: normalizedEmail,
          },
        },
        create: {
          emailAccountId,
          provider: "fastmail",
          email: normalizedEmail,
          appPassword,
        },
        update: { appPassword, isConnected: true },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.calendar.updateMany({
          where: {
            connectionId: connection.id,
            calendarId: {
              notIn: calendars.map((calendar) => calendar.calendarId),
            },
          },
          data: { isEnabled: false },
        }),
        ...calendars.map((calendar) =>
          prisma.calendar.upsert({
            where: {
              connectionId_calendarId: {
                connectionId: connection.id,
                calendarId: calendar.calendarId,
              },
            },
            create: { ...calendar, connectionId: connection.id },
            update: calendar,
          }),
        ),
      ]);
      return { success: true };
    },
  );
