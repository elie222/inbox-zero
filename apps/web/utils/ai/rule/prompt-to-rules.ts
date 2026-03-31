import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateRuleSchema,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
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
    promptHardening: { trust: "trusted" },
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

IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.

Use static conditions for exact deterministic matching, but keep them short and specific.
You can use multiple conditions in a rule, but aim for simplicity.
In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
If a rule can be handled fully with static conditions, do so, but this is rarely possible.
If the rule is only matching exact sender addresses or domains, put those in static.from and leave aiInstructions empty. Do not restate the sender in aiInstructions.
If the user did not specify any sender or domain, leave static.from empty. Never fill it with placeholders like none, null, or @*.
aiInstructions are only for semantic or content matching. Do not repeat sender lists, label names, or actions there.
Example sender-only rule shape: static.from="@airbnb.com|@booking.com|@delta.com" and no aiInstructions.

Output policy:
- Return a JSON object only. No prose and no markdown.
- The output must match the schema exactly: { "rules": [...] }.
- Do not invent actions unsupported by the schema.

Behavior anchors (minimal):
- "When I get a newsletter, archive it and label it as Newsletter" -> one rule with aiInstructions plus ARCHIVE and LABEL actions.
- "Label urgent emails from @company.com as Urgent" -> prefer aiInstructions for urgency and use static.from for @company.com with AND logic when both are present.
- "If someone asks to set up a call, reply with this template ..." -> use the provided template content in fields.content, preserving key wording.
`;
}
