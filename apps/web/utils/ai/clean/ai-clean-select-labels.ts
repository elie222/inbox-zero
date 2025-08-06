import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai/clean/select-labels");

const schema = z.object({ labels: z.array(z.string()).optional() });

export async function aiCleanSelectLabels({
  emailAccount,
  instructions,
}: {
  emailAccount: EmailAccountWithAI;
  instructions: string;
}) {
  const system = `You are an AI assistant helping users organize their emails efficiently.
Your task is to analyze the user's instructions and extract specific labels they want to use for email categorization.

Guidelines:
- Only extract labels explicitly mentioned in the instructions
- Labels should be single words or short phrases
- Do not create labels that weren't mentioned
- If no labels are specified, return an empty array

Return the labels as an array of strings.`;

  const prompt = `<instructions>
${instructions}
</instructions>`.trim();

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema,
    userEmail: emailAccount.email,
    usageLabel: "Clean - Select Labels",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object.labels;
}
