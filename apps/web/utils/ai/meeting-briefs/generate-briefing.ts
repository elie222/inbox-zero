import { tool } from "ai";
import { z } from "zod";
import { getModel } from "@/utils/llms/model";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import { formatDateTimeInUserTimezone } from "@/utils/date";
import { researchGuestWithPerplexity } from "@/utils/ai/meeting-briefs/research-guest";
import type { Logger } from "@/utils/logger";

const guestBriefingSchema = z.object({
  name: z.string().describe("The guest's name"),
  email: z.string().describe("The guest's email address"),
  bullets: z
    .array(z.string())
    .describe("Brief bullet points about this guest (max 10 words each)"),
});

const briefingSchema = z.object({
  guests: z
    .array(guestBriefingSchema)
    .describe("Briefing information for each meeting guest"),
});
export type BriefingContent = z.infer<typeof briefingSchema>;

const AGENTIC_SYSTEM_PROMPT = `You are an AI assistant that prepares concise meeting briefings.

Your task is to prepare a briefing about the external guests the user is meeting with.

WORKFLOW:
1. Review the provided context (email history, past meetings) for each guest
2. For each guest, use the researchGuest tool to find their LinkedIn profile, current role, company, and background
3. Once you have gathered all information, call finalizeBriefing with the complete briefing

TOOLS AVAILABLE:
- researchGuest: Research a guest's professional background (LinkedIn, role, company, work history)
- finalizeBriefing: Submit the final briefing (MUST be called when done)

BRIEFING GUIDELINES:
- Keep it concise: <10 bullet points per guest, max 10 words per bullet
- Focus on what's helpful before the meeting: role, company, recent discussions, pending items
- Don't repeat meeting details (time, date, location) - the user already has those
- If a guest has no prior context and research returns nothing useful, note they are a new contact (one bullet only)
- ONLY include information about the specific guests listed. Do NOT mention other attendees or colleagues.
- Research may be inaccurate for common names - note any uncertainty

IMPORTANT: You MUST call finalizeBriefing when you are done to submit your briefing. If research fails or returns nothing, still call finalizeBriefing with the information you have.`;

export async function aiGenerateMeetingBriefing({
  briefingData,
  emailAccount,
  logger,
}: {
  briefingData: MeetingBriefingData;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<BriefingContent> {
  if (briefingData.externalGuests.length === 0) {
    return { guests: [] };
  }

  const prompt = buildPrompt(briefingData, emailAccount.timezone);
  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    emailAccount,
    label: "Meeting Briefing",
    modelOptions,
  });

  let result: BriefingContent | null = null;

  await generateText({
    ...modelOptions,
    system: AGENTIC_SYSTEM_PROMPT,
    prompt,
    stopWhen: (stepResult) =>
      stepResult.steps.some((step) =>
        step.toolCalls?.some((call) => call.toolName === "finalizeBriefing"),
      ) || stepResult.steps.length > 15,
    tools: {
      researchGuest: tool({
        description:
          "Research a meeting guest to find their LinkedIn profile, current role, company, and professional background",
        inputSchema: z.object({
          email: z.string().describe("The guest's email address"),
          name: z.string().optional().describe("The guest's name if known"),
        }),
        execute: async ({ email, name }) => {
          logger.info("Researching guest", { email, name });
          const research = await researchGuestWithPerplexity({
            email,
            name,
            event: briefingData.event,
            emailAccount,
            logger,
          });
          if (!research) {
            return { found: false, message: "No research results available" };
          }
          return { found: true, research };
        },
      }),
      finalizeBriefing: tool({
        description:
          "Submit the final meeting briefing. Call this when you have gathered all information about all guests.",
        inputSchema: briefingSchema,
        execute: async (briefing) => {
          logger.info("Finalizing briefing", {
            guestCount: briefing.guests.length,
          });
          result = briefing;
          return { success: true };
        },
      }),
    },
  });

  if (!result) {
    logger.warn("No briefing result captured, returning empty briefing");
    return { guests: [] };
  }

  return result;
}

// Exported for testing
export function buildPrompt(
  briefingData: MeetingBriefingData,
  timezone: string | null,
): string {
  const { event, externalGuests, emailThreads, pastMeetings } = briefingData;

  const allMessages = emailThreads.flatMap((t) => t.messages);

  const guestContexts: GuestContextForPrompt[] = externalGuests.map(
    (guest) => ({
      email: guest.email,
      name: guest.name,
      recentEmails: selectRecentEmailsForGuest(allMessages, guest.email),
      recentMeetings: selectRecentMeetingsForGuest(pastMeetings, guest.email),
      timezone,
    }),
  );

  const prompt = `Prepare a concise briefing for this upcoming meeting.

<upcoming_meeting>
Title: ${event.title}
${event.description ? `Description: ${event.description}` : ""}
</upcoming_meeting>

<guest_context>
${guestContexts.map((guest) => formatGuestContext(guest)).join("\n")}
</guest_context>

For each guest listed above:
1. Review their email and meeting history provided
2. Use the researchGuest tool to find their professional background
3. Once you have all information, call finalizeBriefing with the complete briefing`;

  return prompt;
}

type GuestContextForPrompt = {
  email: string;
  name?: string;
  recentEmails: ParsedMessage[];
  recentMeetings: CalendarEvent[];
  timezone: string | null;
};

function formatGuestContext(guest: GuestContextForPrompt): string {
  const recentEmails = guest.recentEmails ?? [];
  const recentMeetings = guest.recentMeetings ?? [];

  const hasEmails = recentEmails.length > 0;
  const hasMeetings = recentMeetings.length > 0;

  const guestHeader = `${guest.name ? `Name: ${guest.name}\n` : ""}Email: ${guest.email}`;

  if (!hasEmails && !hasMeetings) {
    return `<guest>
${guestHeader}

<no_prior_context>This appears to be a new contact with no prior email or meeting history. Use the researchGuest tool to find information about them.</no_prior_context>
</guest>
`;
  }

  const sections: string[] = [];

  if (hasEmails) {
    sections.push(`<recent_emails>
${recentEmails
  .map(
    (email) =>
      `<email>\n${stringifyEmailSimple(getEmailForLLM(email))}\n</email>`,
  )
  .join("\n")}
</recent_emails>`);
  }

  if (hasMeetings) {
    sections.push(`<recent_meetings>
${recentMeetings.map((meeting) => formatMeetingForContext(meeting, guest.timezone)).join("\n")}
</recent_meetings>`);
  }

  return `<guest>
${guestHeader}

${sections.join("\n")}
</guest>
`;
}

function selectRecentMeetingsForGuest(
  pastMeetings: CalendarEvent[],
  guestEmail: string,
): CalendarEvent[] {
  const email = guestEmail.toLowerCase();

  return pastMeetings
    .filter((m) => m.attendees.some((a) => a.email.toLowerCase() === email))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, 10);
}

function selectRecentEmailsForGuest(
  messages: ParsedMessage[],
  guestEmail: string,
): ParsedMessage[] {
  const email = guestEmail.toLowerCase();

  return messages
    .filter((m) => messageIncludesEmail(m, email))
    .sort((a, b) => getMessageTimestampMs(b) - getMessageTimestampMs(a))
    .slice(0, 10);
}

function messageIncludesEmail(
  message: ParsedMessage,
  emailLower: string,
): boolean {
  const headers = message.headers;
  return (
    headers.from.toLowerCase().includes(emailLower) ||
    headers.to.toLowerCase().includes(emailLower) ||
    (headers.cc?.toLowerCase().includes(emailLower) ?? false) ||
    (headers.bcc?.toLowerCase().includes(emailLower) ?? false)
  );
}

function getMessageTimestampMs(message: ParsedMessage): number {
  const internal = message.internalDate;
  if (internal && /^\d+$/.test(internal)) {
    const ms = Number(internal);
    return Number.isFinite(ms) ? ms : 0;
  }

  const parsed = Date.parse(message.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Exported for testing
export function formatMeetingForContext(
  meeting: CalendarEvent,
  timezone: string | null,
): string {
  const dateStr = formatDateTimeInUserTimezone(meeting.startTime, timezone);
  return `<meeting>
Title: ${meeting.title}
Date: ${dateStr}
${meeting.description ? `Description: ${meeting.description.slice(0, 500)}` : ""}
</meeting>
`;
}
