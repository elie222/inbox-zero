import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("DraftFollowUp");

const systemPrompt = `You are an expert assistant that drafts follow-up emails.

You are writing a follow-up email because the user sent the last message in this thread and hasn't received a reply.
The purpose of this email is to politely check in and prompt a response from the recipient.

Follow-ups should be concise - typically 1-3 sentences. This is just a check-in, not a new email.
If a writing style is provided, match the user's tone and formality, but keep the length brief.

Write a friendly follow-up that:
- Acknowledges you're following up on the previous message
- Gently reminds the recipient about the outstanding matter or question
- Does NOT repeat the entire content of the previous email

Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.

Examples of good follow-up phrases: "Just checking in on this", "Wanted to follow up on my previous email", "Circling back on this"

Return your response in JSON format.
`;

const getUserPrompt = ({
  messages,
  emailAccount,
  writingStyle,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  writingStyle: string | null;
}) => {
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

  return `${userAbout}
${writingStylePrompt}

Here is the context of the email thread (from oldest to newest):
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}

Please write a follow-up email to check in on the previous message.
${getTodayForLLM()}
IMPORTANT: You are writing an email as ${emailAccount.email}. Write the follow-up from their perspective.`;
};

const draftSchema = z.object({
  reply: z.string().describe("The complete follow-up email draft"),
});

export async function aiDraftFollowUp({
  messages,
  emailAccount,
  writingStyle,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  writingStyle: string | null;
}) {
  try {
    logger.info("Drafting follow-up email", {
      messageCount: messages.length,
    });

    const prompt = getUserPrompt({
      messages,
      emailAccount,
      writingStyle,
    });

    const modelOptions = getModel(emailAccount.user);

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Draft follow-up",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system: systemPrompt,
      prompt,
      schema: draftSchema,
    });

    return result.object.reply;
  } catch (error) {
    logger.error("Failed to draft follow-up email", { error });
    return {
      error: "Failed to draft follow-up email",
    };
  }
}
