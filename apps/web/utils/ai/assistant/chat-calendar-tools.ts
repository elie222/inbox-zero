import { type InferUITool, tool } from "ai";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import { createCalendarEvent } from "@/utils/calendar/event-writer";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";

const DEFAULT_EVENT_DURATION_MINUTES = 60;

const getCalendarEventsInputSchema = z.object({
  startDate: z
    .string()
    .describe(
      "Start of date range in ISO 8601 format (e.g. 2026-03-18T00:00:00Z)",
    ),
  endDate: z
    .string()
    .describe(
      "End of date range in ISO 8601 format (e.g. 2026-03-19T00:00:00Z)",
    ),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of events to return. Defaults to 25."),
});

export const getCalendarEventsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Fetch calendar events for a date range.",
    inputSchema: getCalendarEventsInputSchema,
    execute: async ({ startDate, endDate, maxResults }) => {
      trackToolCall({ tool: "get_calendar_events", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Inbox Zero settings.",
          };
        }

        const allResults = await Promise.allSettled(
          providers.map((provider) =>
            provider.fetchEvents({
              timeMin: new Date(startDate),
              timeMax: new Date(endDate),
              maxResults: maxResults ?? 25,
            }),
          ),
        );

        const fulfilled = allResults.filter(
          (r): r is PromiseFulfilledResult<CalendarEvent[]> =>
            r.status === "fulfilled",
        );
        const rejectedCount = allResults.length - fulfilled.length;

        if (rejectedCount > 0) {
          logger.warn("Some calendar providers failed", {
            count: rejectedCount,
          });
        }

        if (fulfilled.length === 0) {
          return {
            error:
              "All calendar providers failed to fetch events. Please try again later.",
          };
        }

        const events = fulfilled
          .flatMap((r) => r.value)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .slice(0, maxResults ?? 25)
          .map((event) => ({
            title: event.title,
            startTime: event.startTime.toISOString(),
            endTime: event.endTime.toISOString(),
            location: event.location ?? null,
            attendees: event.attendees.map((a) => a.email),
            videoConferenceLink: event.videoConferenceLink ?? null,
          }));

        return { events, count: events.length };
      } catch (error) {
        logger.error("Failed to fetch calendar events", { error });
        return { error: "Failed to fetch calendar events" };
      }
    },
  });

export type GetCalendarEventsTool = InferUITool<
  ReturnType<typeof getCalendarEventsTool>
>;

const createCalendarEventInputSchema = z.object({
  title: z.string().min(1).describe("Event title."),
  startTime: z
    .string()
    .describe(
      "Event start in ISO 8601 with a UTC offset in the user's timezone (e.g. 2026-03-18T15:00:00-07:00). A value without an offset is interpreted in the user's timezone.",
    ),
  endTime: z
    .string()
    .optional()
    .describe(
      "Event end in the same format as startTime. Defaults to one hour after the start.",
    ),
  description: z
    .string()
    .optional()
    .describe(
      "Event notes. When the event comes from an email, include the useful details from it.",
    ),
  location: z
    .string()
    .optional()
    .describe("Free-text location such as an address or venue name."),
  attendees: z
    .array(z.string().email())
    .optional()
    .describe(
      "Email addresses to invite. Only include people the user explicitly asked to invite; every attendee receives an invitation email.",
    ),
});

export const createCalendarEventTool = ({
  email,
  emailAccountId,
  timezone,
  logger,
}: {
  email: string;
  emailAccountId: string;
  timezone: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Create an event on the user's connected calendar. Use this when the user asks to add, schedule, or put something on their calendar, including events described in an email.",
    inputSchema: createCalendarEventInputSchema,
    execute: async ({
      title,
      startTime,
      endTime,
      description,
      location,
      attendees,
    }) => {
      trackToolCall({ tool: "create_calendar_event", email, logger });

      const start = parseDateTimeInTimezone(startTime, timezone);
      if (!start) {
        return { error: "startTime must be a valid ISO 8601 date-time." };
      }

      const end = endTime
        ? parseDateTimeInTimezone(endTime, timezone)
        : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60_000);
      if (!end) {
        return { error: "endTime must be a valid ISO 8601 date-time." };
      }
      if (end.getTime() <= start.getTime()) {
        return { error: "endTime must be after startTime." };
      }

      const attendeeEmails = attendees ?? [];
      logger.trace("Creating calendar event", {
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        attendeeCount: attendeeEmails.length,
      });

      try {
        const created = await createCalendarEvent({
          emailAccountId,
          title,
          description,
          startTime: start,
          endTime: end,
          timezone,
          attendees: attendeeEmails.map((attendeeEmail) => ({
            email: attendeeEmail,
          })),
          locationType: BookingLinkLocationType.CUSTOM,
          locationValue: location ?? null,
          logger,
        });

        return {
          success: true,
          message: `Added "${title}" to your calendar.`,
          event: {
            id: created.id,
            title,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            timezone,
            location: location ?? null,
            attendees: attendeeEmails,
            eventUrl: created.eventUrl ?? null,
          },
        };
      } catch (error) {
        logger.error("Failed to create calendar event", { error });
        if (error instanceof SafeError) {
          return { error: error.message };
        }
        return { error: "Failed to create calendar event." };
      }
    },
  });

export type CreateCalendarEventTool = InferUITool<
  ReturnType<typeof createCalendarEventTool>
>;

async function trackToolCall({
  tool: toolName,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool: toolName, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
    tool: toolName,
  });
}

// Models sometimes omit the UTC offset; treating that as server-local time
// would silently shift the event, so such values are read in the user's timezone.
function parseDateTimeInTimezone(value: string, timezone: string): Date | null {
  const trimmed = value.trim();
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (hasOffset) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );
  if (!match) return null;

  const [, year, month, day, hours, minutes, seconds] = match;
  const zoned = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds ?? 0),
    timezone,
  );
  return Number.isNaN(zoned.getTime()) ? null : new Date(zoned.getTime());
}
