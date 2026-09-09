import { z } from "zod";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { OLDER_THAN_OPTIONS } from "@/utils/mail/split-query";

/** UNREAD and STARRED are whole conditions on their own; the rest name a target. */
const KINDS_REQUIRING_VALUE = new Set<MailSplitFilterKind>([
  MailSplitFilterKind.LABEL,
  MailSplitFilterKind.CATEGORY,
  MailSplitFilterKind.FROM,
  MailSplitFilterKind.OLDER_THAN,
]);

const OLDER_THAN_VALUES = OLDER_THAN_OPTIONS.map((option) => option.value);

export const mailSplitFilterSchema = z
  .object({
    kind: z.nativeEnum(MailSplitFilterKind),
    value: z.string().trim().min(1).max(320).nullish(),
  })
  .refine(
    (filter) => !KINDS_REQUIRING_VALUE.has(filter.kind) || !!filter.value,
    {
      message: "This condition needs a value",
      path: ["value"],
    },
  )
  .refine(
    (filter) =>
      filter.kind !== MailSplitFilterKind.FROM ||
      z.email().safeParse(filter.value).success,
    { message: "Enter a sender email address", path: ["value"] },
  )
  .refine(
    (filter) =>
      filter.kind !== MailSplitFilterKind.OLDER_THAN ||
      OLDER_THAN_VALUES.includes(filter.value ?? ""),
    { message: "Unknown age", path: ["value"] },
  );

export type MailSplitFilterDraft = z.infer<typeof mailSplitFilterSchema>;

/** One condition row per filter, so the cap matches what the builder can show. */
export const MAX_SPLIT_FILTERS = 10;

export const mailSplitFiltersSchema = z
  .array(mailSplitFilterSchema)
  .max(MAX_SPLIT_FILTERS);

export const mailSplitNameSchema = z.string().trim().min(1).max(60);
