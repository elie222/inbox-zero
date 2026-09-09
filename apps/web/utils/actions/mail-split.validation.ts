import { z } from "zod";
import { MailLayout } from "@/generated/prisma/enums";
import {
  mailSplitFiltersSchema,
  mailSplitNameSchema,
} from "@/utils/mail/split-filters";

export const createMailSplitBody = z
  .object({
    name: mailSplitNameSchema,
    filters: mailSplitFiltersSchema,
    /** False shows mail matching any one condition instead of all of them. */
    matchAll: z.boolean().default(true),
  })
  .refine(validConjunction, {
    message: "Use match any for multiple senders or inbox sections",
    path: ["filters"],
  });
export type CreateMailSplitBody = z.infer<typeof createMailSplitBody>;

export const updateMailSplitBody = z
  .object({
    id: z.string(),
    name: mailSplitNameSchema,
    filters: mailSplitFiltersSchema,
    matchAll: z.boolean().default(true),
  })
  .refine(validConjunction, {
    message: "Use match any for multiple senders or inbox sections",
    path: ["filters"],
  });
export type UpdateMailSplitBody = z.infer<typeof updateMailSplitBody>;

// The client sends the account's available labels and categories so the server
// doesn't have to re-fetch them from the provider; the AI only ever picks from
// these, so it can't invent a label that doesn't exist.
const splitPromptOption = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  kind: z.enum(["LABEL", "CATEGORY"]),
  value: z.string().trim().min(1),
});
export type SplitPromptOptionInput = z.infer<typeof splitPromptOption>;

export const buildMailSplitFromPromptBody = z.object({
  prompt: z.string().trim().min(1).max(300),
  options: z.array(splitPromptOption).max(500),
  senders: z.array(z.string().trim().min(1).max(320)).max(200),
});
export type BuildMailSplitFromPromptBody = z.infer<
  typeof buildMailSplitFromPromptBody
>;

export const deleteMailSplitBody = z.object({ id: z.string() });
export type DeleteMailSplitBody = z.infer<typeof deleteMailSplitBody>;

export const updateMailPreferencesBody = z
  .object({
    layout: z.nativeEnum(MailLayout).optional(),
    expandedPreview: z.boolean().optional(),
  })
  // Every field is optional so a caller can update one preference without
  // restating the others, which would otherwise also accept an empty update.
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Provide at least one preference",
  });
export type UpdateMailPreferencesBody = z.infer<
  typeof updateMailPreferencesBody
>;

function validConjunction(split: {
  matchAll: boolean;
  filters: { kind: string; value?: string | null }[];
}) {
  if (!split.matchAll) return true;
  const senders = new Set(
    split.filters
      .filter((filter) => filter.kind === "FROM")
      .map((filter) => filter.value),
  );
  const sections = new Set(
    split.filters
      .filter(
        (filter) =>
          filter.kind === "CATEGORY" &&
          (filter.value === "focused" || filter.value === "other"),
      )
      .map((filter) => filter.value),
  );
  return senders.size <= 1 && sections.size <= 1;
}
