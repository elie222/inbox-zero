import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

const logger = createScopedLogger("meetings/parse-request");

// Meeting provider preferences
export const meetingProviderSchema = z.enum([
  "teams",
  "zoom",
  "google-meet",
  "none",
]);
export type MeetingProvider = z.infer<typeof meetingProviderSchema>;

// Parsed meeting request schema
export const parsedMeetingRequestSchema = z.object({
  // Attendees
  attendees: z
    .array(z.string().email())
    .describe(
      "Email addresses of people who should attend the meeting. Extract from email recipients and any mentions in the body.",
    ),

  // Date/time information
  dateTimePreferences: z
    .array(z.string())
    .describe(
      "Preferred date/time options mentioned in the email, in natural language (e.g., 'next Tuesday at 2pm', 'tomorrow morning', 'Jan 15 at 10am'). Leave empty if no specific times mentioned.",
    ),

  // Duration
  durationMinutes: z
    .number()
    .min(15)
    .max(480)
    .default(60)
    .describe(
      "Expected meeting duration in minutes. Default to 60 if not specified.",
    ),

  // Meeting details
  title: z
    .string()
    .describe(
      "A brief, professional title for the meeting based on the email content and purpose.",
    ),

  agenda: z
    .string()
    .nullable()
    .describe(
      "The meeting agenda or purpose extracted from the email. Can be null if not clearly stated.",
    ),

  // Meeting provider preference
  preferredProvider: meetingProviderSchema
    .nullable()
    .describe(
      "Preferred video conferencing provider if mentioned (teams, zoom, google-meet). If not mentioned, return null.",
    ),

  // Location
  location: z
    .string()
    .nullable()
    .describe(
      "Physical location if this is an in-person meeting, or null for virtual meetings.",
    ),

  // Additional context
  notes: z
    .string()
    .nullable()
    .describe(
      "Any additional context, special requests, or important notes from the email.",
    ),

  // Urgency
  isUrgent: z
    .boolean()
    .default(false)
    .describe(
      "Whether the meeting request indicates urgency (e.g., 'ASAP', 'urgent', 'today').",
    ),
});

export type ParsedMeetingRequest = z.infer<typeof parsedMeetingRequestSchema>;

/**
 * Parse a meeting request from an email using AI
 *
 * Extracts:
 * - Attendees (from To/CC and email body)
 * - Date/time preferences
 * - Duration
 * - Meeting title and agenda
 * - Preferred provider (Teams/Zoom/Meet)
 * - Location (physical or virtual)
 * - Additional notes and urgency
 */
export async function aiParseMeetingRequest({
  email,
  emailAccount,
  userEmail,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  userEmail: string;
}): Promise<ParsedMeetingRequest> {
  logger.info("Parsing meeting request", {
    emailAccountId: emailAccount.id,
    subject: email.subject,
  });

  const system = getSystemPrompt(userEmail);
  const prompt = getPrompt({ email, emailAccount });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    label: "Parse meeting request",
    userEmail: emailAccount.email,
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schemaDescription: "Parsed meeting request details",
    schema: parsedMeetingRequestSchema,
  });

  logger.info("Meeting request parsed successfully", {
    attendeeCount: result.object.attendees.length,
    title: result.object.title,
    preferredProvider: result.object.preferredProvider,
    isUrgent: result.object.isUrgent,
  });

  return result.object;
}

function getSystemPrompt(userEmail: string): string {
  return `You are an AI assistant that analyzes emails to extract meeting scheduling information.

Your task is to parse meeting-related emails and extract structured information about the meeting request.

Key guidelines:
1. **Attendees**: Extract all email addresses from To/CC fields and any additional people mentioned in the email body. ALWAYS include ${userEmail} in the attendees list.
2. **Date/Time**: Extract any date/time preferences in natural language. If none are specified, return an empty array.
3. **Duration**: Estimate meeting duration from context. Default to 60 minutes if not specified.
4. **Title**: Create a clear, professional meeting title based on the email subject and content.
5. **Agenda**: Extract the meeting purpose/agenda from the email body. Be concise.
6. **Provider**: Only set if explicitly mentioned (e.g., "Teams meeting", "Zoom call", "Google Meet"). Otherwise return null.
7. **Location**: Only for in-person meetings. Return null for virtual meetings.
8. **Notes**: Capture any special requests, preparation needed, or important context.
9. **Urgency**: Mark as urgent only if explicitly indicated (e.g., "ASAP", "urgent", "today", "immediately").

Be thorough but concise. Extract only information present in the email.`;
}

function getPrompt({
  email,
  emailAccount,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
}): string {
  const userInfo = getUserInfoPrompt({ emailAccount });

  // Build recipient list
  const recipients: string[] = [];
  if (email.to) recipients.push(`To: ${email.to}`);
  if (email.cc) recipients.push(`CC: ${email.cc}`);

  return `${userInfo}

<current_time>
${new Date().toISOString()}
</current_time>

<email>
<subject>${email.subject || "(no subject)"}</subject>
<from>${email.from}</from>
${recipients.length > 0 ? `<recipients>\n${recipients.join("\n")}\n</recipients>` : ""}
<content>
${email.content || "(no content)"}
</content>
</email>

Parse this email and extract all meeting-related information.`.trim();
}
