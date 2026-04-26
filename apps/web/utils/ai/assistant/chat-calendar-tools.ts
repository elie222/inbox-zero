import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";

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
