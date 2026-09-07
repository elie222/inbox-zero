import { z } from "zod";
import { MailSplitKind } from "@/generated/prisma/enums";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { MAX_SPLIT_LABELS } from "@/utils/mail/split-constants";

export type SplitPromptOption = {
  id: string;
  name: string;
  kind: MailSplitKind;
};

const promptToSplitSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "One short sentence naming the options you picked and why, or why none of them fit. Shown to the user.",
    ),
  optionIds: z
    .array(z.string())
    .describe(
      `Ids of every option the split should cover, at most ${MAX_SPLIT_LABELS}. Empty when nothing fits. More than one id is only allowed for label options, and means the split shows mail carrying any of those labels.`,
    ),
  name: z
    .string()
    .nullable()
    .describe(
      "A short tab name covering everything the split shows, at most three words. Null when optionIds is empty.",
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
  const system = `You match a user's description of an inbox split to their existing mail filters.

A split is a tab in the mail client that shows a filtered slice of the inbox. Each option is one available filter: a read state, a provider category, or one of the user's labels. You cannot create new filters; you can only pick from the options given.

Instructions:
- Pick an option only when its filter means the same thing as part of what the user described. Match by meaning, in any language, not only exact wording.
- A description that covers several of the user's labels should return every matching label id, up to ${MAX_SPLIT_LABELS} of them. The split then shows mail carrying any of them. Example: "invoices and receipts" returns both label ids when both labels exist.
- Only label options can be combined. Read states and categories are exclusive: return exactly one id when you pick one.
- If the description is narrower than an option's filter, leave that option out. Example: the user asks for "emails from my bank" and the closest option is a broad "Personal" category — that tab would mostly show unrelated mail, so it is not a match.
- Return an empty list rather than a loose match. A sender, person, or topic that no option covers has no match.
- The name must describe everything the picked options show together. Never name the split after only a subset of what it will contain.
- The reasoning is shown to the user, so say which options you picked, or say plainly that none of their labels or categories cover the description.`;

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
