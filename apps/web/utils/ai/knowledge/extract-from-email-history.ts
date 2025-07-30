import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getTodayForLLM } from "@/utils/llms/helpers";
import { preprocessBooleanLike } from "@/utils/zod";

const logger = createScopedLogger("EmailHistoryExtractor");

const SYSTEM_PROMPT = `You are an email history analysis agent. Your task is to analyze the provided historical email threads and extract relevant information that would be helpful for drafting a response to the current email thread.

Your task:
1. Analyze the historical email threads to understand relevant past context and interactions
2. Identify key points, commitments, questions, and unresolved items from previous conversations
3. Extract any relevant dates, deadlines, or time-sensitive information mentioned in past exchanges
4. Note any specific preferences or communication patterns shown in previous exchanges

Provide a concise summary (max 500 characters) that captures the most important historical context needed for drafting a response to the current thread. Focus on:
- Key unresolved points or questions from past exchanges
- Any commitments or promises made in previous conversations
- Important dates or deadlines established in past emails
- Notable preferences or patterns in communication`;

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

const extractionSchema = z.object({
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

    const system = SYSTEM_PROMPT;
    const prompt = getUserPrompt({
      currentThreadMessages,
      historicalMessages,
      emailAccount,
    });

    logger.trace("Input", { system, prompt });

    const result = await chatCompletionObject({
      system,
      prompt,
      schema: extractionSchema,
      usageLabel: "Email history extraction",
      userAi: emailAccount.user,
      userEmail: emailAccount.email,
      modelType: "economy",
    });

    logger.trace("Output", result.object);

    return result.object.summary;
  } catch (error) {
    logger.error("Failed to extract information from email history", { error });
    return null;
  }
}
