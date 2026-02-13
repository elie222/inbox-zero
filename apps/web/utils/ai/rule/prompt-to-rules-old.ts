import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateOrUpdateRuleSchema,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { PROMPT_TO_RULES_SHARED_GUIDANCE } from "@/utils/ai/rule/prompt-to-rules-guidance";
import { createScopedLogger } from "@/utils/logger";
import { convertMentionsToLabels } from "@/utils/mention";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("ai-prompt-to-rules");

const updateRuleSchema = (provider: string) =>
  createRuleSchema(provider).extend({
    ruleId: z.string().nullable(),
  });

export async function aiPromptToRulesOld({
  emailAccount,
  promptFile,
  isEditing,
}: {
  emailAccount: EmailAccountWithAI;
  promptFile: string;
  isEditing: boolean;
}): Promise<CreateOrUpdateRuleSchema[]> {
  function getSchema() {
    return isEditing
      ? updateRuleSchema(emailAccount.account.provider)
      : createRuleSchema(emailAccount.account.provider);
  }

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
    schema: z.object({ rules: z.array(getSchema()) }),
  });

  if (!aiResponse.object) {
    logger.error("No rules found in AI response", { aiResponse });
    throw new Error("No rules found in AI response");
  }

  const rules = aiResponse.object.rules;

  return rules;
}

function getSystemPrompt() {
  return `You are an AI assistant that converts email management rules into a structured format. Parse the given prompt file and convert it into rules.

${PROMPT_TO_RULES_SHARED_GUIDANCE}
`;
}
