import { z } from "zod";
import { tool } from "ai";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import {
  getCalendarAvailability,
  getSuggestedTimeSlots,
} from "@/utils/calendar/availability";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("calendar-availability");

export type CalendarAvailabilityContext = {
  suggestedTimes: string[];
};

/**
 * Check if an email thread contains meeting/scheduling requests and get calendar availability
 */
export async function aiGetCalendarAvailability({
  emailAccount,
  messages,
}: {
  emailAccount: EmailAccountWithAI;
  messages: EmailForLLM[];
}): Promise<CalendarAvailabilityContext | null> {
  if (!messages || messages.length === 0) {
    logger.warn("No messages provided for calendar availability check");
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

  const system = `You are an AI assistant that analyzes email threads to determine if they contain meeting or scheduling requests.

Your task is to:
1. Analyze the full email thread to determine if it's related to scheduling a meeting, call, or appointment
2. Consider context from all messages - scheduling requests may be established across multiple messages
3. If it is scheduling-related, extract the date and time information mentioned anywhere in the thread
4. Use the checkCalendarAvailability tool to get actual availability data
5. Return structured data about the scheduling request

If the email thread is not about scheduling, return isRelevant: false.`;

  const prompt = `Analyze this email thread for meeting/scheduling requests:

${threadContent}

Extract any date and time information mentioned across all messages and check calendar availability if relevant. Consider the full conversation context to understand scheduling requests that may have been established in earlier messages.`;

  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Calendar availability analysis",
    modelOptions,
  });

  const toolCallResults: string[][] = [];

  await generateText({
    ...modelOptions,
    system,
    prompt,
    stopWhen: (result) =>
      result.steps.some((step) =>
        step.toolCalls?.some(
          (call) => call.toolName === "checkCalendarAvailability",
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

          for (const calendarConnection of calendarConnections) {
            const calendarIds = calendarConnections.flatMap((conn) =>
              conn.calendars.map((cal) => cal.calendarId),
            );

            if (!calendarIds.length) {
              continue;
            }

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

              const suggestedTimes = getSuggestedTimeSlots(
                availabilityData.timeSlots,
                3,
              );

              toolCallResults.push(suggestedTimes);
            } catch (error) {
              logger.error("Error checking calendar availability", { error });
            }
          }
        },
      }),
    },
  });

  return { suggestedTimes: toolCallResults.flat() };
}
