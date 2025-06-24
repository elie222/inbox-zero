import { z } from "zod";
import { ColdEmailSetting } from "@prisma/client";

export const coldEmailBlockerBody = z.object({
  from: z.string(),
  subject: z.string(),
  textHtml: z.string().nullable(),
  textPlain: z.string().nullable(),
  snippet: z.string().nullable(),
  // Hacky fix. Not sure why this happens. Is internalDate sometimes a string and sometimes a number?
  date: z.string().or(z.number()).optional(),
  threadId: z.string().nullable(),
  messageId: z.string().nullable(),
});
export type ColdEmailBlockerBody = z.infer<typeof coldEmailBlockerBody>;

export const updateColdEmailSettingsBody = z.object({
  coldEmailBlocker: z
    .enum([
      ColdEmailSetting.DISABLED,
      ColdEmailSetting.LIST,
      ColdEmailSetting.LABEL,
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    ])
    .nullish(),
  coldEmailDigest: z.boolean().nullish(),
});
export type UpdateColdEmailSettingsBody = z.infer<
  typeof updateColdEmailSettingsBody
>;

export const updateColdEmailPromptBody = z.object({
  coldEmailPrompt: z.string().nullish(),
});
export type UpdateColdEmailPromptBody = z.infer<
  typeof updateColdEmailPromptBody
>;

export const markNotColdEmailBody = z.object({ sender: z.string() });
export type MarkNotColdEmailBody = z.infer<typeof markNotColdEmailBody>;
