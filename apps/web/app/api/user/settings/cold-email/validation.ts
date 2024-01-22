import { z } from "zod";
import { ColdEmailSetting } from "@prisma/client";

export const updateColdEmailSettingsBody = z.object({
  coldEmailBlocker: z
    .enum([
      ColdEmailSetting.DISABLED,
      ColdEmailSetting.LIST,
      ColdEmailSetting.LABEL,
      ColdEmailSetting.ARCHIVE_AND_LABEL,
    ])
    .nullish(),
  coldEmailPrompt: z.string().nullish(),
});
export type UpdateColdEmailSettingsBody = z.infer<
  typeof updateColdEmailSettingsBody
>;
