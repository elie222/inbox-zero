import { z } from "zod";
import { attachmentSourceInputSchema } from "@/utils/attachments/source-schema";

export const upsertRuleAttachmentSourcesBody = z.object({
  ruleId: z.string(),
  sources: z.array(attachmentSourceInputSchema),
});
export type UpsertRuleAttachmentSourcesBody = z.infer<
  typeof upsertRuleAttachmentSourcesBody
>;
