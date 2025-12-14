import { z } from "zod";
import { format } from "date-fns";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";

const briefingSchema = z.object({
  briefing: z.string().describe("The meeting briefing content"),
});

export async function aiGenerateMeetingBriefing({
  briefingData,
  emailAccount,
}: {
  briefingData: MeetingBriefingData;
  emailAccount: EmailAccountWithAI;
}): Promise<string> {
  const system = `You are an AI assistant that prepares concise meeting briefings.

Your task is to prepare a briefing that includes:
(1) Key details about the external guests the user is meeting with
(2) Any relevant context from past email exchanges and meetings with them
(3) AI-researched background information (LinkedIn, current role, company, work history) when available

Guidelines:
- Keep it short and use <10 bullets per meeting guest (max 10 words per bullet)
- Don't include details about the meeting itself (time, date, location, etc.) - the user already has that
- Focus on information that would be helpful to know before the meeting
- Include any recent topics discussed, pending items, or relationship context
- When AI research is available (LinkedIn, role, company), include it to help the user understand who they're meeting
- If a guest has <no_prior_context>, simply note they are a new contact (one bullet point only, don't repeat this in multiple ways)
- ONLY include information about the specific guests listed in <guest_context>. Do NOT mention other meeting attendees, organizers, or colleagues.
- AI research may be inaccurate for common names or generic email addresses

Output the briefing as plain text with bullet points using "-" for each point.
Group information by guest if there are multiple external guests.`;

  const prompt = buildPrompt(briefingData);

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Meeting Briefing",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: briefingSchema,
  });

  return result.object.briefing;
}

function buildPrompt(briefingData: MeetingBriefingData): string {
  const { event, externalGuests, emailThreads, pastMeetings } = briefingData;

  const allMessages = emailThreads.flatMap((t) => t.messages);

  const guestContexts: GuestContextForPrompt[] = externalGuests.map(
    (guest) => ({
      email: guest.email,
      name: guest.name,
      aiResearch: guest.aiResearch ?? undefined,
      recentEmails: selectRecentEmailsForGuest(allMessages, guest.email),
      recentMeetings: selectRecentMeetingsForGuest(pastMeetings, guest.email),
    }),
  );

  const prompt = `Please prepare a concise briefing for this meeting.

<upcoming_meeting>
Title: ${event.title}
${event.description ? `Description: ${event.description}` : ""}
</upcoming_meeting>

<guest_context>
${guestContexts.map((guest) => formatGuestContext(guest)).join("\n")}
</guest_context>

Return the briefing as JSON with a "briefing" field containing the formatted text.`;

  return prompt;
}

type GuestContextForPrompt = {
  email: string;
  name?: string;
  recentEmails: ParsedMessage[];
  recentMeetings: CalendarEvent[];
  aiResearch?: string;
};

function formatGuestContext(guest: GuestContextForPrompt): string {
  const recentEmails = guest.recentEmails ?? [];
  const recentMeetings = guest.recentMeetings ?? [];
  const aiResearch = guest.aiResearch;

  const hasAiResearch = Boolean(aiResearch);
  const hasEmails = recentEmails.length > 0;
  const hasMeetings = recentMeetings.length > 0;

  if (!hasAiResearch && !hasEmails && !hasMeetings) {
    return `<guest email="${guest.email}"${guest.name ? ` name="${guest.name}"` : ""}>
<no_prior_context>This appears to be a new contact with no prior email, meeting, or public profile history.</no_prior_context>
</guest>
`;
  }

  const sections: string[] = [];

  if (hasAiResearch) {
    sections.push(`<ai_research>
${aiResearch}
</ai_research>`);
  }

  if (hasEmails) {
    sections.push(`<recent_emails count="${recentEmails.length}">
${recentEmails
  .map(
    (email) =>
      `<email>\n${stringifyEmailSimple(getEmailForLLM(email))}\n</email>`,
  )
  .join("\n")}
</recent_emails>`);
  }

  if (hasMeetings) {
    sections.push(`<recent_meetings count="${recentMeetings.length}">
${recentMeetings.map(formatMeetingForContext).join("\n")}
</recent_meetings>`);
  }

  return `<guest email="${guest.email}"${guest.name ? ` name="${guest.name}"` : ""}>
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

function formatMeetingForContext(meeting: CalendarEvent): string {
  const dateStr = format(meeting.startTime, "MMM d, yyyy 'at' h:mm a");
  return `<meeting>
Title: ${meeting.title}
Date: ${dateStr}
${meeting.description ? `Description: ${meeting.description.slice(0, 500)}` : ""}
</meeting>
`;
}
