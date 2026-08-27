import { z } from "zod";
import { MailSplitKind } from "@/generated/prisma/enums";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";

export type SplitPromptOption = {
  id: string;
  name: string;
  kind: MailSplitKind;
};

const promptToSplitSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "One short sentence: which option filters for what the user described, or why none of them does",
    ),
  optionId: z
    .string()
    .nullable()
    .describe(
      "The id of the option that filters for what the user described, or null when no option does",
    ),
  name: z
    .string()
    .nullable()
    .describe(
      "A short tab name for the split, at most three words. Null when optionId is null.",
    ),
});
export type PromptToSplitResult = z.infer<typeof promptToSplitSchema>;

export async function aiPromptToSplit({
  emailAccount,
  prompt,
  options,
}: {
  emailAccount: EmailAccountWithAI;
  prompt: string;
  options: SplitPromptOption[];
}): Promise<PromptToSplitResult> {
  const system = `You match a user's description of an inbox split to one of their existing mail filters.

A split is a tab in the mail client that shows a filtered slice of the inbox. Each option is one available filter: a read state, a provider category, or one of the user's labels. You cannot create new filters; you can only pick from the options given.

Instructions:
- Pick an option only when its filter means the same thing as the user's description. Match by meaning, in any language, not only exact wording.
- If the description is narrower than an option's filter, return null. Example: the user asks for "emails from my bank" and the closest option is a broad "Personal" category — that tab would mostly show unrelated mail, so it is not a match.
- If no option fits, return null for optionId. A sender, person, or topic that no option covers must return null. Never pick a loosely related option just to return something.
- The name must describe everything the matched option shows: use the matched option's own name unless the user's wording describes that same filter more clearly. Never name the split after only a subset of what it will contain.`;

  const userPrompt = `<options>
${options.map((option) => `- id: ${option.id} | name: ${option.name} | type: ${kindLabel(option.kind)}`).join("\n")}
</options>

<description>
${prompt}
</description>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.PromptToSplit,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Prompt to split",
    modelOptions,
    promptHardening: { trust: "trusted" },
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt: userPrompt,
    schema: promptToSplitSchema,
  });

  return result.object;
}

function kindLabel(kind: MailSplitKind): string {
  switch (kind) {
    case MailSplitKind.UNREAD:
      return "read state";
    case MailSplitKind.CATEGORY:
      return "category";
    case MailSplitKind.LABEL:
      return "label";
    default:
      return "inbox";
  }
}
