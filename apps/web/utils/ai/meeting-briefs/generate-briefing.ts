import { z } from "zod";
import { format } from "date-fns";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { CalendarEvent } from "@/utils/calendar/calendar-types";
import type {
  MeetingBriefingData,
  GuestContext,
} from "@/utils/meeting-briefs/gather-context";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";

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

Guidelines:
- Keep it short and use <10 bullets per meeting guest (max 10 words per bullet)
- Don't include details about the meeting itself (time, date, location, etc.) - the user already has that
- Don't use emoji
- Focus on information that would be helpful to know before the meeting
- Include any recent topics discussed, pending items, or relationship context
- If there's no meaningful context for a guest, briefly note that this appears to be a new contact

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
  const { event, externalGuests } = briefingData;

  const prompt = `Please prepare a concise briefing for this meeting.

<upcoming_meeting>
Title: ${event.title}
${event.description ? `Description: ${event.description}` : ""}
</upcoming_meeting>

<guest_context>
${externalGuests.map((guest) => formatGuestContext(guest))}
</guest_context>

Return the briefing as JSON with a "briefing" field containing the formatted text.`;

  return prompt;
}

function formatGuestContext(guest: GuestContext): string {
  const recentEmailsSection =
    guest.recentEmails.length > 0
      ? `<recent_emails count="${guest.recentEmails.length}">
${guest.recentEmails
  .map(
    (email) =>
      `<email>\n${stringifyEmailSimple(getEmailForLLM(email))}\n</email>`,
  )
  .join("\n")}
</recent_emails>`
      : "<recent_emails>No recent emails found with this contact.</recent_emails>";

  const recentMeetingsSection =
    guest.recentMeetings.length > 0
      ? `<recent_meetings count="${guest.recentMeetings.length}">
${guest.recentMeetings.map(formatMeetingForContext).join("\n")}
</recent_meetings>`
      : "<recent_meetings>No recent meetings found with this contact.</recent_meetings>";

  return `<guest email="${guest.email}"${guest.name ? ` name="${guest.name}"` : ""}>
${recentEmailsSection}
${recentMeetingsSection}
</guest>
`;
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
