import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("summarize-digest-email");

const schema = z.object({
  content: z.string().describe("The content of the summary text"),
});
type AISummarizeResult = z.infer<typeof schema>;

export async function aiSummarizeEmailForDigest({
  ruleName,
  emailAccount,
  messageToSummarize,
}: {
  ruleName: string;
  emailAccount: EmailAccountWithAI & { name: string | null };
  messageToSummarize: EmailForLLM;
}): Promise<AISummarizeResult | null> {
  // If messageToSummarize somehow is null/undefined, default to null.
  if (!messageToSummarize) return null;

  const userMessageForPrompt = messageToSummarize;

  const system = `You are an AI assistant that processes emails for inclusion in a daily digest.
Your task is to summarize the content accordingly using the provided schema.

I will provide you with:
- A user's name and some context about them.
- The email category
- The email content

Guidelines for summarizing the email:
- If the email is spam, promotional, or irrelevant, return "null".
- Do NOT mention the sender's name or start with phrases like "This is a message from X" or "This email from Y" - the sender information is already displayed separately.
- Jump directly into the content of the email.
- Use bullet points to structure information when there are multiple items or pieces of information.
- For structured data (orders, confirmations, receipts):
  • Use bullet points with "Key: Value" format
  • Example: "• Order Total: $99.99\\n• Delivery Date: March 15"
- For newsletters and announcements:
  • List the key topics or news items as bullet points
  • Focus on the actual content, not who sent it
  • Example: "• New feature launches next week\\n• 20% discount on all plans\\n• Webinar scheduled for Friday"
- For direct messages:
  • Summarize in the second person (as if talking directly to the user)
  • Use phrasing like: "You have received…", "You are invited…", "Your request has been…"
  • Use bullet points if there are multiple action items or pieces of information
- Only include human-relevant and human-readable information.
- Exclude opaque technical identifiers like account IDs, payment IDs, tracking tokens, or long alphanumeric strings that aren't meaningful to users.
`;

  const prompt = `
<email>
  <content>${stringifyEmailSimple(userMessageForPrompt)}</content>
  <category>${ruleName}</category>
</email>

${getUserInfoPrompt({ emailAccount })}`;

  logger.info("Summarizing email for digest");

  try {
    const modelOptions = getModel(emailAccount.user);

    const generateObject = createGenerateObject({
      userEmail: emailAccount.email,
      label: "Summarize email",
      modelOptions,
    });

    const aiResponse = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    return aiResponse.object;
  } catch (error) {
    logger.error("Failed to summarize email", { error });

    return null;
  }
}
