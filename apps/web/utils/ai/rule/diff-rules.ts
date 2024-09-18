import { z } from "zod";
import { createPatch } from "diff";
import { chatCompletionTools } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";

const parameters = z.object({
  addedRules: z.array(z.string()).describe("The added rules"),
  editedRules: z.array(z.string()).describe("The edited rules"),
  removedRules: z.array(z.string()).describe("The removed rules"),
});

export async function aiDiffRules({
  user,
  oldPromptFile,
  newPromptFile,
}: {
  user: UserAIFields & { email: string };
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

## Diff:
${diff}

Please identify and return the rules that were added, edited, or removed. Return the actual content of the rules, not numbers.`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      diff_rules: {
        description:
          "Analyze two prompt files and their diff to return the differences",
        parameters,
      },
    },
    userEmail: user.email,
    label: "Diff rules",
  });

  const parsedRules = aiResponse.toolCalls[0].args as z.infer<
    typeof parameters
  >;
  return parsedRules;
}
