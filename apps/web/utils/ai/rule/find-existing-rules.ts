import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Action, Rule } from "@prisma/client";

const parameters = z.object({
  existingRules: z
    .array(
      z.object({
        ruleId: z.string().describe("The id of the existing rule"),
        promptNumber: z
          .number()
          .describe("The index of the prompt that matches the rule"),
      }),
    )
    .describe("The existing rules that match the prompt rules"),
});

export async function aiFindExistingRules({
  emailAccount,
  promptRulesToEdit,
  promptRulesToRemove,
  databaseRules,
}: {
  emailAccount: EmailAccountWithAI;
  promptRulesToEdit: { oldRule: string; newRule: string }[];
  promptRulesToRemove: string[];
  databaseRules: (Rule & { actions: Action[] })[];
}) {
  const promptRules = [
    ...promptRulesToEdit.map((r) => r.oldRule),
    ...promptRulesToRemove,
  ];

  const system =
    "You are an AI assistant that checks if the prompt rules are already in the database.";
  const prompt = `Analyze the following prompt rules and the existing database rules to identify the existing rules that match the prompt rules:

## Prompt rules:
${promptRules.map((rule, index) => `${index + 1}: ${rule}`).join("\n")}

## Existing database rules:
${JSON.stringify(databaseRules, null, 2)}

Please return the existing rules that match the prompt rules.`;

  const aiResponse = await chatCompletionTools({
    userAi: emailAccount.user,
    prompt,
    system,
    tools: {
      find_existing_rules: {
        description: "Find the existing rules that match the prompt rules",
        parameters,
      },
    },
    userEmail: emailAccount.email,
    label: "Find existing rules",
  });

  const parsedRules = aiResponse.toolCalls[0]?.args as z.infer<
    typeof parameters
  >;

  const existingRules = parsedRules.existingRules.map((rule) => {
    const promptRule = rule.promptNumber
      ? promptRules[rule.promptNumber - 1]
      : null;

    const toRemove = promptRule
      ? promptRulesToRemove.includes(promptRule)
      : null;

    const toEdit = promptRule
      ? promptRulesToEdit.find((r) => r.oldRule === promptRule)
      : null;

    return {
      rule: databaseRules.find((dbRule) => dbRule.id === rule.ruleId),
      promptNumber: rule.promptNumber,
      promptRule,
      toRemove: !!toRemove,
      toEdit: !!toEdit,
      updatedPromptRule: toEdit?.newRule,
    };
  });

  return {
    editedRules: existingRules.filter((rule) => rule.toEdit),
    removedRules: existingRules.filter((rule) => rule.toRemove),
  };
}
