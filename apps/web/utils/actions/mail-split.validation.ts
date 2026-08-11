import { z } from "zod";
import { MailLayout, MailSplitKind } from "@/generated/prisma/enums";

// LABEL splits carry a provider label id; CATEGORY splits carry a provider category
// (e.g. CATEGORY_PERSONAL). ALL and UNREAD need no value.
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

export const renameMailSplitBody = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
});
export type RenameMailSplitBody = z.infer<typeof renameMailSplitBody>;

export const deleteMailSplitBody = z.object({ id: z.string() });
export type DeleteMailSplitBody = z.infer<typeof deleteMailSplitBody>;

export const reorderMailSplitsBody = z.object({
  ids: z.array(z.string()).min(1),
});
export type ReorderMailSplitsBody = z.infer<typeof reorderMailSplitsBody>;

export const updateMailPreferencesBody = z
  .object({
    layout: z.nativeEnum(MailLayout).optional(),
    hintBarDismissed: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });
export type UpdateMailPreferencesBody = z.infer<
  typeof updateMailPreferencesBody
>;
