import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getTodayForLLM } from "@/utils/llms/helpers";
import { preprocessBooleanLike } from "@/utils/zod";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

const logger = createScopedLogger("EmailHistoryExtractor");

const system = `You are an email history analysis agent. Your task is to analyze the provided historical email threads and extract relevant information that would be helpful for drafting a response to the current email thread.

Your task:
1. Analyze the historical email threads to understand relevant past context and interactions
2. Identify key points, commitments, questions, and unresolved items from previous conversations
3. Extract any relevant dates, deadlines, or time-sensitive information mentioned in past exchanges
4. Note any specific preferences or communication patterns shown in previous exchanges

Provide a concise summary (max 500 characters) that captures the most important historical context needed for drafting a response to the current thread. Focus on:
- Key unresolved points or questions from past exchanges
- Any commitments or promises made in previous conversations
- Important dates or deadlines established in past emails
- Notable preferences or patterns in communication

Return your response in JSON format.`;

const getUserPrompt = ({
  currentThreadMessages,
  historicalMessages,
  emailAccount,
}: {
  currentThreadMessages: EmailForLLM[];
  historicalMessages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
}) => {
  return `<current_email_thread>
${currentThreadMessages.map((m) => stringifyEmail(m, 10_000)).join("\n---\n")}
</current_email_thread>

${
  historicalMessages.length > 0
    ? `<historical_email_threads>
${historicalMessages.map((m) => stringifyEmail(m, 10_000)).join("\n---\n")}
</historical_email_threads>`
    : "No historical email threads available."
}

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

${getTodayForLLM()}
Analyze the historical email threads and extract any relevant information that would be helpful for drafting a response to the current email thread. Provide a concise summary of the key historical context.`;
};

const schema = z.object({
  hasHistoricalContext: z
    .preprocess(preprocessBooleanLike, z.boolean())
    .describe("Whether there is any relevant historical context found."),
  summary: z
    .string()
    .describe(
      "A concise summary of relevant historical context, including key points, commitments, deadlines, from past conversations.",
    ),
});

export async function aiExtractFromEmailHistory({
  currentThreadMessages,
  historicalMessages,
  emailAccount,
}: {
  currentThreadMessages: EmailForLLM[];
  historicalMessages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
}): Promise<string | null> {
  try {
    logger.info("Extracting information from email history", {
      currentThreadCount: currentThreadMessages.length,
      historicalCount: historicalMessages.length,
    });

    if (historicalMessages.length === 0) return null;

    const prompt = getUserPrompt({
      currentThreadMessages,
      historicalMessages,
      emailAccount,
    });

    const modelOptions = getModel(emailAccount.user, "economy");

    const generateObject = createGenerateObject({
      userEmail: emailAccount.email,
      label: "Email history extraction",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    return result.object.summary;
  } catch (error) {
    logger.error("Failed to extract information from email history", { error });
    return null;
  }
}
