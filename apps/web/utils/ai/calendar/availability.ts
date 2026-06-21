import { TZDate } from "@date-fns/tz";
import { expandWeeklyAvailability } from "@inboxzero/scheduling";
import { z } from "zod";
import { tool } from "ai";
import type { Logger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import { formatInUserTimezone } from "@/utils/date";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const timeSlotSchema = z.object({
  start: z.string().describe("Start time in format YYYY-MM-DD HH:MM"),
  end: z
    .string()
    .describe(
      "End time in format YYYY-MM-DD HH:MM - infer meeting duration from email context",
    ),
});

const schema = z.object({
  suggestedTimes: z.array(timeSlotSchema),
  noAvailability: z
    .boolean()
    .optional()
    .describe(
      "Set to true if the user has no availability in the requested timeframe",
    ),
});

export type CalendarAvailabilityContext = z.infer<typeof schema> & {
  timezone?: string | null;
};

type BusyPeriod = { start: string | Date; end: string | Date };
type AvailabilityWindow = { startTime: string; endTime: string };

const MODEL_TIME_FORMAT = "yyyy-MM-dd HH:mm";

export async function aiGetCalendarAvailability({
  emailAccount,
  messages,
  logger,
  bookingLinkAvailable = false,
}: {
  emailAccount: EmailAccountWithAI;
  messages: EmailForLLM[];
  logger: Logger;
  bookingLinkAvailable?: boolean;
}): Promise<CalendarAvailabilityContext | null> {
  if (!messages?.length) {
    logger.warn("No messages provided for calendar availability check");
    return null;
  }

  const threadContent = messages
    .map((msg, index) => {
      const content = `${msg.subject || ""} ${msg.content || ""}`.trim();
      return content ? `Message ${index + 1}: ${content}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!threadContent) {
    logger.info("No content in thread messages, skipping calendar check");
    return null;
  }

  const [calendarConnections, defaultAvailabilitySchedule] = await Promise.all([
    prisma.calendarConnection.findMany({
      where: {
        emailAccountId: emailAccount.id,
        isConnected: true,
      },
      include: {
        calendars: {
          where: { isEnabled: true },
          select: {
            calendarId: true,
            timezone: true,
            primary: true,
          },
        },
      },
    }),
    prisma.availabilitySchedule.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        isDefault: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        timezone: true,
        windows: {
          select: {
            weekday: true,
            startMinutes: true,
            endMinutes: true,
          },
        },
      },
    }),
  ]);

  const hasDefaultAvailabilitySchedule = defaultAvailabilitySchedule != null;
  const userTimezone =
    defaultAvailabilitySchedule?.timezone ??
    getUserTimezone(emailAccount, calendarConnections);

  logger.trace("Determined user timezone", { userTimezone });

  const system = `You are an AI assistant that analyzes email threads to determine if they contain meeting or scheduling requests, and returns available meeting time slots.

TIMEZONE: All times (busy periods, suggested times) are in ${userTimezone}.
The user ${bookingLinkAvailable ? "has" : "does not have"} a booking link available for scheduling.

Your task is to:
1. Analyze if the email is scheduling-related (meeting, call, appointment)
2. Extract any date/time preferences from the email
3. Use checkCalendarAvailability to get busy periods (already in ${userTimezone})
4. Suggest ONLY times that DO NOT overlap with busy periods
5. Return time slots with start AND end times (infer duration from context: "quick call" = 30min, "meeting" = 60min)
6. If there are NO available times (user is busy all day), set noAvailability=true and return empty suggestedTimes array
${hasDefaultAvailabilitySchedule ? "7. When checkCalendarAvailability returns availabilityWindows, suggest ONLY times fully inside those windows." : ""}

CRITICAL: Do NOT suggest times overlapping with busy periods.
Example: If busy 2025-11-17 09:00 to 2025-11-17 17:00, suggest times AFTER 17:00 or BEFORE 09:00.
Example: If busy all day (00:00 to 23:59), return empty array and set noAvailability=true.
${hasDefaultAvailabilitySchedule ? "CRITICAL: Do NOT suggest times outside the returned availabilityWindows, even if the calendar is free then." : ""}

Format: "YYYY-MM-DD HH:MM"
If email mentions timezone (e.g., "5pm PST"), convert to ${userTimezone}.
When the user has a booking link and the sender is only asking for a general way to schedule, do not call checkCalendarAvailability or returnSuggestedTimes; finish without tool calls so the draft can use the booking link instead.
Only check calendar availability when manual calendar information is actually needed, such as when the sender explicitly asks for specific times, asks whether a proposed date/time works, or the booking link would not answer the scheduling request.
Call "returnSuggestedTimes" only once.`;

  const prompt = `${getUserInfoPrompt({ emailAccount })}
  
<current_time>
${new Date().toISOString()}
</current_time>

<thread>
${threadContent}
</thread>`.trim();

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.CalendarAvailability,
  );

  const generateText = createGenerateText({
    emailAccount,
    label: "Calendar availability analysis",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  let result: CalendarAvailabilityContext | null = null;
  let lastBusyPeriods: BusyPeriod[] = [];
  let lastAvailabilityWindows: AvailabilityWindow[] | null = null;

  await generateText({
    ...modelOptions,
    system,
    prompt,
    stopWhen: (result) =>
      result.steps.some((step) =>
        step.toolCalls?.some(
          (call) => call.toolName === "returnSuggestedTimes",
        ),
      ) || result.steps.length > 5,
    tools: {
      checkCalendarAvailability: tool({
        description:
          "Check calendar availability across all connected calendars (Google and Microsoft) for meeting requests",
        inputSchema: z.object({
          timeMin: z
            .string()
            .describe("The minimum time to check availability for"),
          timeMax: z
            .string()
            .describe("The maximum time to check availability for"),
        }),
        execute: async ({ timeMin, timeMax }) => {
          const startDate = new Date(timeMin);
          const endDate = new Date(timeMax);

          try {
            const busyPeriods = await getUnifiedCalendarAvailability({
              emailAccountId: emailAccount.id,
              startDate,
              endDate,
              timezone: userTimezone,
              logger,
            });

            logger.trace("Unified calendar availability data", {
              busyPeriods,
            });

            lastBusyPeriods = busyPeriods;
            lastAvailabilityWindows = defaultAvailabilitySchedule
              ? expandWeeklyAvailability({
                  start: startDate,
                  end: endDate,
                  timezone: userTimezone,
                  rules: defaultAvailabilitySchedule.windows,
                })
              : null;

            const availabilityWindows = lastAvailabilityWindows?.map(
              (window) => ({
                start: formatInUserTimezone(
                  new Date(window.startTime),
                  userTimezone,
                  MODEL_TIME_FORMAT,
                ),
                end: formatInUserTimezone(
                  new Date(window.endTime),
                  userTimezone,
                  MODEL_TIME_FORMAT,
                ),
              }),
            );

            return availabilityWindows
              ? { busyPeriods, availabilityWindows }
              : { busyPeriods };
          } catch (error) {
            logger.error("Error checking calendar availability", { error });
            return { busyPeriods: [] };
          }
        },
      }),
      returnSuggestedTimes: tool({
        description: "Return suggested times for a meeting",
        inputSchema: schema,
        execute: async (data) => {
          const suggestedTimes = data.suggestedTimes.filter((slot) =>
            isAllowedSuggestedSlot({
              slot,
              timezone: userTimezone,
              busyPeriods: lastBusyPeriods,
              availabilityWindows: lastAvailabilityWindows,
            }),
          );
          const noAvailability =
            data.noAvailability ||
            (data.suggestedTimes.length > 0 && suggestedTimes.length === 0);

          result = {
            ...data,
            suggestedTimes,
            ...(noAvailability ? { noAvailability: true } : {}),
            timezone: userTimezone,
          };
        },
      }),
    },
  });

  return result;
}

function isAllowedSuggestedSlot({
  slot,
  timezone,
  busyPeriods,
  availabilityWindows,
}: {
  slot: z.infer<typeof timeSlotSchema>;
  timezone: string;
  busyPeriods: BusyPeriod[];
  availabilityWindows: AvailabilityWindow[] | null;
}) {
  const start = parseModelLocalTime(slot.start, timezone);
  const end = parseModelLocalTime(slot.end, timezone);

  if (!start || !end || end <= start) return false;

  if (
    availabilityWindows &&
    !availabilityWindows.some(
      (window) =>
        start >= new Date(window.startTime) && end <= new Date(window.endTime),
    )
  ) {
    return false;
  }

  return !busyPeriods.some((busyPeriod) => {
    const busyStart = new Date(busyPeriod.start);
    const busyEnd = new Date(busyPeriod.end);

    return start < busyEnd && end > busyStart;
  });
}

function parseModelLocalTime(localTime: string, timezone: string) {
  const match = localTime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);

  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
    timezone,
  );

  const utcDate = new Date(date.getTime());
  return Number.isNaN(utcDate.getTime()) ? null : utcDate;
}

function getUserTimezone(
  emailAccount: EmailAccountWithAI,
  calendarConnections: Array<{
    calendars: Array<{
      calendarId: string;
      timezone: string | null;
      primary: boolean;
    }>;
  }>,
): string {
  // First priority: user's explicitly set timezone
  if (emailAccount.timezone) {
    return emailAccount.timezone;
  }

  // Second: try to find the primary calendar's timezone
  for (const connection of calendarConnections) {
    const primaryCalendar = connection.calendars.find((cal) => cal.primary);
    if (primaryCalendar?.timezone) {
      return primaryCalendar.timezone;
    }
  }

  // Third: find any calendar with a timezone
  for (const connection of calendarConnections) {
    for (const calendar of connection.calendars) {
      if (calendar.timezone) {
        return calendar.timezone;
      }
    }
  }

  // Last resort: UTC
  return "UTC";
}
