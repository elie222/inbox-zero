import { z } from "zod";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createScopedLogger } from "@/utils/logger";
import type { MeetingSummary } from "@/utils/ai/meeting-recorder/summarize-meeting";
import type { MeetingAttendee } from "@/utils/meeting-recorder/attendees";
import { getTodayForLLM } from "@/utils/ai/helpers";

const logger = createScopedLogger("DraftMeetingFollowUp");

const systemPrompt = `You are drafting a follow-up email that the user will send to the other people who were on a call with them.

The user reviews and sends this themselves, so write it as them, ready to send.

Rules:
- Only reference what the meeting actually covered. Never invent a commitment, a deadline, a price or a next step that was not agreed.
- Do not promise anything on the user's behalf that they did not say they would do.
- Recap only what is useful to the recipients. This is an email, not a transcript: a few short paragraphs or a small list.
- Address the recipients as a group. Do not open with a placeholder like "[Name]".
- If a writing style is provided, match the user's tone and formality.
- Write in the language the meeting was held in.
- Don't mention that you are an AI, and don't add a signature.

Return your response in JSON format.`;

const draftSchema = z.object({
  subject: z.string().describe("The email subject line"),
  body: z.string().describe("The plain-text body of the follow-up email"),
});

type MeetingFollowUpDraft = z.infer<typeof draftSchema>;

export type MeetingFollowUpInput = {
  emailAccount: EmailAccountWithAI;
  eventTitle: string;
  summary: MeetingSummary;
  recipients: MeetingAttendee[];
  writingStyle: string | null;
  currentDate?: Date;
};

export async function aiDraftMeetingFollowUp(
  input: MeetingFollowUpInput,
): Promise<MeetingFollowUpDraft> {
  const { emailAccount, recipients } = input;
  logger.info("Drafting meeting follow-up", {
    recipientCount: recipients.length,
  });

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.MeetingFollowUpDraft,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Draft meeting follow-up",
    modelOptions,
    promptHardening: {
      trust: "untrusted",
      level: "full",
      outputConstraint: "plain-text",
    },
  });

  const result = await generateObject({
    ...modelOptions,
    system: systemPrompt,
    prompt: buildMeetingFollowUpModelInput(input),
    schema: draftSchema,
  });

  return result.object;
}

export function buildMeetingFollowUpModelInput({
  emailAccount,
  eventTitle,
  summary,
  recipients,
  writingStyle,
  currentDate = new Date(),
}: MeetingFollowUpInput): string {
  const userAbout = emailAccount.about
    ? `Context about the user:

<userAbout>
${emailAccount.about}
</userAbout>
`
    : "";

  const writingStylePrompt = writingStyle
    ? `Writing style:

<writing_style>
${writingStyle}
</writing_style>
`
    : "";

  const recipientList = recipients
    .map((recipient) =>
      recipient.name
        ? `${recipient.name} (${recipient.email})`
        : recipient.email,
    )
    .join("\n");

  return `${userAbout}
${writingStylePrompt}
Meeting title: ${eventTitle}

Recipients:
${recipientList}

Meeting summary:
<summary>
${JSON.stringify(summary, null, 2)}
</summary>

${getTodayForLLM(currentDate)}
Write the follow-up email as ${emailAccount.email}.`;
}
