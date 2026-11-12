import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { preprocessBooleanLike } from "@/utils/zod";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const system = `You are an email history analysis agent. From the historical email threads, extract only the context needed to reply to the current email thread: earlier details, commitments, dates or preferences that the current thread refers to or that a correct reply depends on.

Leave out everything else, including past topics that are still open but that the current thread does not raise. If nothing qualifies, set hasHistoricalContext to false and return an empty summary.

Keep the summary under 500 characters. Return your response in JSON format.`;

const getUserPrompt = ({
  currentThreadMessages,
  historicalMessages,
  emailAccount,
}: {
  currentThreadMessages: EmailForLLM[];
  historicalMessages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
}) => `<current_email_thread>
${getEmailListPrompt({ messages: currentThreadMessages, messageMaxLength: 10_000 })}
</current_email_thread>

${
  historicalMessages.length > 0
    ? `<historical_email_threads>
${getEmailListPrompt({ messages: historicalMessages, messageMaxLength: 10_000 })}
</historical_email_threads>`
    : "No historical email threads available."
}

${getUserInfoPrompt({ emailAccount })}

${getTodayForLLM()}
Summarize only the historical context relevant to replying to the current email thread.`;

const schema = z.object({
  hasHistoricalContext: z
    .preprocess(preprocessBooleanLike, z.boolean())
    .describe(
      "Whether the history contains context needed to reply to the current thread.",
    ),
  summary: z
    .string()
    .describe(
      "Only the historical context needed to reply to the current thread. Empty if none.",
    ),
});

export async function aiExtractFromEmailHistory({
  currentThreadMessages,
  historicalMessages,
  emailAccount,
  logger,
}: {
  currentThreadMessages: EmailForLLM[];
  historicalMessages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  logger: Logger;
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

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.EmailHistoryExtraction,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Email history extraction",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const result = await generateObject({
      ...modelOptions,
      instructions: system,
      prompt,
      schema,
    });

    return result.object.hasHistoricalContext ? result.object.summary : null;
  } catch (error) {
    logger.error("Failed to extract information from email history", { error });
    return null;
  }
}
