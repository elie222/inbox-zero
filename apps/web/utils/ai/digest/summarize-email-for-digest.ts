import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export const schema = z.object({
  content: z.string().describe("The content of the summary text"),
});

const logger = createScopedLogger("summarize-digest-email");

export type AISummarizeResult = z.infer<typeof schema>;

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
- If the email contains extractable fields such as order details, totals, dates, IDs, payment info, or similar, summarize the content using a list with the format: "Key: Value" separated by newlines.
- Only include human-relevant and human-readable information.
- Exclude opaque technical identifiers like account IDs, payment IDs, tracking tokens, or long alphanumeric strings that aren't meaningful to users.
- If the email is a direct message to the user, summarize it in the second person (as if talking directly to the user) using phrasing such as: "You have received…", "X wants you to review…", "You are invited…", etc.
- If second person phrasing is not possible or natural (e.g., for announcements, newsletters, or general updates), summarize in a clear neutral third-person style.
`;

  const prompt = `
<email>
  <content>${stringifyEmailSimple(userMessageForPrompt)}</content>
  <category>${ruleName}</category>
</email>

<user>
  <about>${emailAccount.about}</about>
  <name>${emailAccount.name}</name>
</user>`;

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
