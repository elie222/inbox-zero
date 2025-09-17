import { z } from "zod";
import { tool } from "ai";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { getCalendarAvailability } from "@/utils/calendar/availability";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("calendar-availability");

const schema = z.object({ suggestedTimes: z.array(z.string()) });
export type CalendarAvailabilityContext = z.infer<typeof schema>;

export async function aiGetCalendarAvailability({
  emailAccount,
  messages,
}: {
  emailAccount: EmailAccountWithAI;
  messages: EmailForLLM[];
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

  const calendarConnections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId: emailAccount.id,
      isConnected: true,
    },
    include: {
      calendars: {
        where: { isEnabled: true },
        select: { calendarId: true },
      },
    },
  });

  const system = `You are an AI assistant that analyzes email threads to determine if they contain meeting or scheduling requests, and if yes, returns the suggested times for the meeting.

Your task is to:
1. Analyze the email thread to determine if it's related to scheduling a meeting, call, or appointment
2. If it is scheduling-related, extract the date and time information mentioned anywhere in the thread
3. Use the checkCalendarAvailability tool to get actual availability from the user's calendars
4. Return possible times for the meeting by calling "returnSuggestedTimes" with the suggested dates and times

If the email thread is not about scheduling, return isRelevant: false.

You can only call "returnSuggestedTimes" once.
Your suggested times should be in the format of "YYYY-MM-DD HH:MM".
IMPORTANT: Another agent is responsible for drafting the final email reply. You just need to reply with the suggested times.`;

  const prompt = `
${
  emailAccount.about
    ? `<user_info>
<about>${emailAccount.about}</about>
<email>${emailAccount.email}</email>
</user_info>`
    : `<user_info>
<email>${emailAccount.email}</email>
</user_info>`
}
  
<current_time>
${new Date().toISOString()}
</current_time>

<thread>
${threadContent}
</thread>`.trim();

  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Calendar availability analysis",
    modelOptions,
  });

  let result: CalendarAvailabilityContext["suggestedTimes"] | null = null;

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
        description: "Check Google Calendar availability for meeting requests",
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

          const promises = calendarConnections.map(
            async (calendarConnection) => {
              const calendarIds = calendarConnections.flatMap((conn) =>
                conn.calendars.map((cal) => cal.calendarId),
              );

              if (!calendarIds.length) return;

              try {
                const availabilityData = await getCalendarAvailability({
                  accessToken: calendarConnection.accessToken,
                  refreshToken: calendarConnection.refreshToken,
                  expiresAt: calendarConnection.expiresAt?.getTime() || null,
                  emailAccountId: emailAccount.id,
                  calendarIds,
                  startDate,
                  endDate,
                });

                return availabilityData;
              } catch (error) {
                logger.error("Error checking calendar availability", { error });
              }
            },
          );

          const busyPeriods = await Promise.all(promises);

          return { busyPeriods: busyPeriods.flat() };
        },
      }),
      returnSuggestedTimes: tool({
        description: "Return suggested times for a meeting",
        inputSchema: schema,
        execute: async ({ suggestedTimes }) => {
          result = suggestedTimes;
        },
      }),
    },
  });

  return result ? { suggestedTimes: result } : null;
}
