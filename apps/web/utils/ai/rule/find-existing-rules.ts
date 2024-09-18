import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";
import { Action, Rule } from "@prisma/client";

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
  user,
  promptRulesToEdit,
  promptRulesToRemove,
  databaseRules,
}: {
  user: UserAIFields & { email: string };
  promptRulesToEdit: string[];
  promptRulesToRemove: string[];
  databaseRules: (Rule & { actions: Action[] })[];
}) {
  const promptRules = [...promptRulesToEdit, ...promptRulesToRemove];

  const system =
    "You are an AI assistant that checks if the prompt rules are already in the database.";
  const prompt = `Analyze the following prompt rules and the existing database rules to identify the existing rules that match the prompt rules:

## Prompt rules:
${promptRules.map((rule, index) => `${index + 1}: ${rule}`).join("\n")}

## Existing database rules:
${JSON.stringify(databaseRules, null, 2)}

Please return the existing rules that match the prompt rules.`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      find_existing_rules: {
        description: "Find the existing rules that match the prompt rules",
        parameters,
      },
    },
    userEmail: user.email,
    label: "Find existing rules",
  });

  const parsedRules = aiResponse.toolCalls[0].args as z.infer<
    typeof parameters
  >;

  return parsedRules.existingRules.map((rule) => {
    const promptRule = rule.promptNumber
      ? promptRules[rule.promptNumber - 1]
      : null;

    return {
      rule: databaseRules.find((dbRule) => dbRule.id === rule.ruleId),
      promptNumber: rule.promptNumber,
      promptRule,
      toEdit: !!(promptRule && promptRulesToEdit.includes(promptRule)),
      toRemove: !!(promptRule && promptRulesToRemove.includes(promptRule)),
    };
  });
}
