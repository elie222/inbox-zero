import { z } from "zod";
import {
  MailLayout,
  MailListDensity,
  MailSplitKind,
} from "@/generated/prisma/enums";

// LABEL splits carry a provider label id; CATEGORY splits carry a provider category
// (e.g. CATEGORY_PERSONAL). INBOX and UNREAD need no value.
const requiresValue = (kind: MailSplitKind) =>
  kind === MailSplitKind.LABEL || kind === MailSplitKind.CATEGORY;

export const createMailSplitBody = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: z.nativeEnum(MailSplitKind),
    value: z.string().trim().min(1).nullish(),
  })
  .refine((data) => !requiresValue(data.kind) || !!data.value, {
    message: "Label and category splits need a value",
    path: ["value"],
  });
export type CreateMailSplitBody = z.infer<typeof createMailSplitBody>;

// The client sends the account's available options (labels, categories, states)
// so the server doesn't have to re-fetch them from the provider; the AI only
// ever picks one of these, so a made-up option can't produce a split.
const splitPromptOption = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    kind: z.nativeEnum(MailSplitKind),
    value: z.string().trim().min(1).nullish(),
  })
  .refine((data) => !requiresValue(data.kind) || !!data.value, {
    message: "Label and category splits need a value",
    path: ["value"],
  });

export const createMailSplitFromPromptBody = z.object({
  prompt: z.string().trim().min(1).max(300),
  options: z.array(splitPromptOption).min(1).max(500),
});
export type CreateMailSplitFromPromptBody = z.infer<
  typeof createMailSplitFromPromptBody
>;

export const renameMailSplitBody = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
});
export type RenameMailSplitBody = z.infer<typeof renameMailSplitBody>;

export const deleteMailSplitBody = z.object({ id: z.string() });
export type DeleteMailSplitBody = z.infer<typeof deleteMailSplitBody>;

export const setDefaultMailSplitsBody = z.object({ enabled: z.boolean() });
export type SetDefaultMailSplitsBody = z.infer<typeof setDefaultMailSplitsBody>;

export const updateMailPreferencesBody = z
  .object({
    layout: z.nativeEnum(MailLayout).optional(),
    density: z.nativeEnum(MailListDensity).optional(),
  })
  .refine((data) => data.layout !== undefined || data.density !== undefined, {
    message: "At least one preference is required",
  });
export type UpdateMailPreferencesBody = z.infer<
  typeof updateMailPreferencesBody
>;
