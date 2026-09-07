import { z } from "zod";
import { MailLayout, MailSplitKind } from "@/generated/prisma/enums";
import { MAX_SPLIT_LABELS } from "@/utils/mail/split-constants";

// LABEL splits carry one or more provider label ids; CATEGORY splits carry a
// single provider category (e.g. CATEGORY_PERSONAL). INBOX and UNREAD carry none.
const kindAndValues = {
  kind: z.nativeEnum(MailSplitKind),
  values: z.array(z.string().trim().min(1)).max(MAX_SPLIT_LABELS),
};
const hasValidValues = ({
  kind,
  values,
}: {
  kind: MailSplitKind;
  values: string[];
}) => {
  if (kind === MailSplitKind.LABEL) return values.length >= 1;
  if (kind === MailSplitKind.CATEGORY) return values.length === 1;
  return values.length === 0;
};
const valuesError = {
  message:
    "Label splits need at least one label, category splits exactly one category",
  path: ["values"],
};

export const createMailSplitBody = z
  .object({ name: z.string().trim().min(1).max(60), ...kindAndValues })
  .refine(hasValidValues, valuesError);
export type CreateMailSplitBody = z.infer<typeof createMailSplitBody>;

// The client sends the account's available options (labels, categories, states)
// so the server doesn't have to re-fetch them from the provider; the AI only
// ever picks from these, so a made-up option can't reach the UI.
const splitPromptOption = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    ...kindAndValues,
  })
  .refine(hasValidValues, valuesError);

export const suggestMailSplitBody = z.object({
  prompt: z.string().trim().min(1).max(300),
  options: z.array(splitPromptOption).min(1).max(500),
});
export type SuggestMailSplitBody = z.infer<typeof suggestMailSplitBody>;

export const renameMailSplitBody = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
});
export type RenameMailSplitBody = z.infer<typeof renameMailSplitBody>;

export const deleteMailSplitBody = z.object({ id: z.string() });
export type DeleteMailSplitBody = z.infer<typeof deleteMailSplitBody>;

export const setDefaultMailSplitsBody = z.object({ enabled: z.boolean() });
export type SetDefaultMailSplitsBody = z.infer<typeof setDefaultMailSplitsBody>;

export const hiddenBuiltInSplitsSchema = z
  .array(z.enum(["all", "unread"]))
  .max(2)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Hidden split IDs must be unique",
  });

export const updateMailPreferencesBody = z
  .object({
    layout: z.nativeEnum(MailLayout).optional(),
    expandedPreview: z.boolean().optional(),
    hiddenBuiltInSplits: hiddenBuiltInSplitsSchema.optional(),
  })
  // Every field is optional so a caller can update one preference without
  // restating the others, which would otherwise also accept an empty update.
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Provide at least one preference",
  });
export type UpdateMailPreferencesBody = z.infer<
  typeof updateMailPreferencesBody
>;
