import z from "zod";
import { createPatch } from "diff";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export async function aiDiffRules({
  emailAccount,
  oldPromptFile,
  newPromptFile,
}: {
  emailAccount: EmailAccountWithAI;
  oldPromptFile: string;
  newPromptFile: string;
}) {
  const diff = createPatch("prompt", oldPromptFile, newPromptFile);

  const system =
    "You are an AI assistant that analyzes differences between two prompt files and identifies added, edited, and removed rules.";
  const prompt = `Analyze the following prompt files and their diff to identify the added, edited, and removed rules:

## Old prompt file:
${oldPromptFile}

## New prompt file:
${newPromptFile}

## Diff for guidance only:
${diff}

Please identify and return the rules that were added, edited, or removed, following these guidelines:
1. Return the full content of each rule, not just the changes.
2. For edited rules, include the new version in the 'editedRules' category ONLY.
3. Do NOT include edited rules in the 'addedRules' or 'removedRules' categories.
4. Treat any change to a rule, no matter how small, as an edit.
5. Ignore changes in whitespace or formatting unless they alter the rule's meaning.
6. If a rule is moved without other changes, do not categorize it as edited.

Organize your response using the 'diff_rules' function.

IMPORTANT: Do not include a rule in more than one category. If a rule is edited, do not include it in the 'removedRules' category!
If a rule is edited, it is an edit and not a removal! Be extra careful to not make this mistake.

Return the result in JSON format. Do not include any other text in your response.

<example>
{
  "addedRules": ["rule text1", "rule text2"],
  "editedRules": [
    {
      "oldRule": "rule text3",
      "newRule": "rule text4 updated"
    },
  ],
  "removedRules": ["rule text5", "rule text6"]
}
</example>
`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Diff rules",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schemaName: "diff_rules",
    schemaDescription:
      "The result of the diff rules analysis. Return the result in JSON format. Do not include any other text in your response.",
    schema: z.object({
      addedRules: z.array(z.string()).describe("The added rules"),
      editedRules: z
        .array(
          z.object({
            oldRule: z.string().describe("The old rule"),
            newRule: z.string().describe("The new rule"),
          }),
        )
        .describe("The edited rules"),
      removedRules: z.array(z.string()).describe("The removed rules"),
    }),
  });

  return result.object;
}
