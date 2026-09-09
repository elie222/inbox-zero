import { z } from "zod";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import type { MailSplitFilterDraft } from "@/utils/mail/split-filters";
import { OLDER_THAN_OPTIONS } from "@/utils/mail/split-query";

export type SplitPromptOption = {
  id: string;
  name: string;
  kind: "LABEL" | "CATEGORY";
  value: string;
};

// Flat rather than a discriminated union: model-facing schemas travel better
// across providers when the root and its rows stay plain objects.
const promptToSplitSchema = z.object({
  reasoning: z
    .string()
    .describe("One short sentence explaining the conditions you chose"),
  name: z
    .string()
    .nullable()
    .describe("A short tab name, at most three words. Null if unsure."),
  matchAll: z
    .boolean()
    .describe(
      "True when mail must meet every condition, false when meeting any one of them is enough",
    ),
  conditions: z
    .array(
      z.object({
        kind: z
          .enum([
            "UNREAD",
            "STARRED",
            "LABEL",
            "CATEGORY",
            "FROM",
            "OLDER_THAN",
          ])
          .describe("Which kind of condition this row is"),
        optionId: z
          .string()
          .nullable()
          .describe(
            "For LABEL and CATEGORY: the id of one of the listed options. Null for every other kind.",
          ),
        sender: z
          .string()
          .nullable()
          .describe(
            "For FROM: the sender's email address. Null for every other kind.",
          ),
        age: z
          .string()
          .nullable()
          .describe(
            `For OLDER_THAN: one of ${OLDER_THAN_OPTIONS.map((o) => o.value).join(", ")}. Null for every other kind.`,
          ),
      }),
    )
    .describe("The conditions that define this split. Empty when none fit."),
});

export type PromptToSplitFiltersResult = {
  filters: MailSplitFilterDraft[];
  name: string | null;
  matchAll: boolean;
};

export async function aiPromptToSplitFilters({
  emailAccount,
  prompt,
  options,
  senders,
}: {
  emailAccount: EmailAccountWithAI;
  prompt: string;
  options: SplitPromptOption[];
  senders: string[];
}): Promise<PromptToSplitFiltersResult> {
  const system = `You turn a description of an inbox split into a set of filter conditions.

A split is a tab in the mail client showing a slice of the inbox. The reader reviews and edits your conditions before the split is saved, so prefer a small, obviously-correct set over a clever one.

Condition kinds:
- UNREAD — mail the reader has not opened
- STARRED — mail the reader starred
- LABEL — one of the reader's labels, chosen by optionId from <options>
- CATEGORY — one of the provider categories, chosen by optionId from <options>
- FROM — a sender's email address
- OLDER_THAN — mail older than 3d, 1w or 1m

Instructions:
- Match LABEL and CATEGORY options by their everyday meaning, including descriptions of the mail that belongs in them; the reader need not use the exact label name. Use a clear semantic fit, but never invent an id or select an unrelated option just to return something.
- For a sender the description names, use FROM with the address. <senders> lists people the reader corresponds with; use one of those addresses when the description names a person, otherwise use an explicit email address from the description. Do not guess addresses or use bare domains.
- Return an empty list of conditions when the description names something none of these kinds can express. An empty list is a better answer than a wrong filter.
- Set matchAll false only when the description asks for alternatives ("X or Y"). Default to true.
- The name must describe everything the split will show, not just one condition.`;

  const userPrompt = `<options>
${options.map((option) => `- id: ${option.id} | name: ${option.name} | type: ${option.kind === "CATEGORY" ? "category" : "label"}`).join("\n") || "(none)"}
</options>

<senders>
${senders.join("\n") || "(none)"}
</senders>

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

  return {
    name: result.object.name,
    matchAll: result.object.matchAll,
    filters: toFilters(result.object.conditions, options),
  };
}

/**
 * Resolves the model's rows against the options the client actually sent, so a
 * hallucinated label id drops the condition rather than creating a broken split.
 */
function toFilters(
  conditions: z.infer<typeof promptToSplitSchema>["conditions"],
  options: SplitPromptOption[],
): MailSplitFilterDraft[] {
  const olderThanValues = new Set(OLDER_THAN_OPTIONS.map((o) => o.value));

  return conditions.flatMap((condition): MailSplitFilterDraft[] => {
    switch (condition.kind) {
      case "UNREAD":
        return [{ kind: MailSplitFilterKind.UNREAD, value: null }];
      case "STARRED":
        return [{ kind: MailSplitFilterKind.STARRED, value: null }];
      case "LABEL":
      case "CATEGORY": {
        const option = options.find((o) => o.id === condition.optionId);
        if (!option) return [];
        return [
          {
            kind:
              option.kind === "CATEGORY"
                ? MailSplitFilterKind.CATEGORY
                : MailSplitFilterKind.LABEL,
            value: option.value,
          },
        ];
      }
      case "FROM": {
        const sender = condition.sender?.trim();
        if (!sender || !z.email().safeParse(sender).success) return [];
        return [{ kind: MailSplitFilterKind.FROM, value: sender }];
      }
      case "OLDER_THAN": {
        const age = condition.age?.trim() ?? "";
        if (!olderThanValues.has(age)) return [];
        return [{ kind: MailSplitFilterKind.OLDER_THAN, value: age }];
      }
    }
  });
}
