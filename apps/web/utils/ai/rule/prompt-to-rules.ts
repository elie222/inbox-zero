import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateRuleSchema,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { PROMPT_TO_RULES_SHARED_GUIDANCE } from "@/utils/ai/rule/prompt-to-rules-guidance";
import { createScopedLogger } from "@/utils/logger";
import { convertMentionsToLabels } from "@/utils/mention";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("ai-prompt-to-rules");

export async function aiPromptToRules({
  emailAccount,
  promptFile,
}: {
  emailAccount: EmailAccountWithAI;
  promptFile: string;
}): Promise<CreateRuleSchema[]> {
  const system = getSystemPrompt();

  const cleanedPromptFile = convertMentionsToLabels(promptFile);

  const prompt = `Convert the following prompt file into rules:
  
<prompt>
${cleanedPromptFile}
</prompt>`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Prompt to rules",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    prompt,
    system,
    schema: z.object({
      rules: z.array(createRuleSchema(emailAccount.account.provider)),
    }),
  });

  if (!aiResponse.object) {
    logger.error("No rules found in AI response", { aiResponse });
    throw new Error("No rules found in AI response");
  }

  const rules = aiResponse.object.rules;

  return rules;
}

function getSystemPrompt() {
  return `You are an AI assistant that converts email management rules into a structured format. Parse the given prompt and convert it into rules.

Use short, concise rule names (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.

${PROMPT_TO_RULES_SHARED_GUIDANCE}
`;
}
