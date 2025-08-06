import { z } from "zod";
import { generateText, tool } from "ai";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Action, Rule } from "@prisma/client";
import { getModel } from "@/utils/llms/model";
import { saveAiUsage } from "@/utils/usage";
import { isDefined } from "@/utils/types";

const schema = z
  .object({
    ruleId: z.string().describe("The id of the existing rule"),
    promptNumber: z
      .number()
      .describe("The index of the prompt that matches the rule"),
  })
  .describe("The existing rules that match the prompt rules");

const findExistingRules = tool({
  description: "Find the existing rules that match the prompt rules.",
  inputSchema: schema,
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

  // const aiResponse = await chatCompletionObject({
  //   userAi: emailAccount.user,
  //   prompt,
  //   system,
  //   output: "array",
  //   schemaName: "Find existing rules",
  //   schemaDescription: "Find the existing rules that match the prompt rules",
  //   schema: z
  //     .object({
  //       ruleId: z.string().describe("The id of the existing rule"),
  //       promptNumber: z
  //         .number()
  //         .describe("The index of the prompt that matches the rule"),
  //     })
  //     .describe("The existing rules that match the prompt rules"),
  //   userEmail: emailAccount.email,
  //   usageLabel: "Find existing rules",
  // });

  const { provider, model, llmModel, providerOptions } = getModel(
    emailAccount.user,
    "chat",
  );

  const result = await generateText({
    model: llmModel,
    system,
    prompt,
    providerOptions,
    tools: {
      findExistingRules,
    },
  });

  if (result.usage) {
    await saveAiUsage({
      email: emailAccount.email,
      usage: result.usage,
      provider,
      model,
      label: "Find existing rules",
    });
  }

  const existingRules = result.toolCalls
    .map((toolCall) => {
      if (toolCall.toolName !== "findExistingRules") return;

      const rule = toolCall.input as z.infer<typeof schema>;

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
    })
    .filter(isDefined);

  return {
    editedRules: existingRules.filter((rule) => rule.toEdit),
    removedRules: existingRules.filter((rule) => rule.toRemove),
  };
}
