import { z } from "zod";
import { bcp47LanguageTag } from "@/app/api/ai/translate/validation";

export const translateThreadBody = z.object({
  // One slot of the translator's 20-text limit goes to the subject.
  messageIds: z.array(z.string().trim().min(1)).min(1).max(19),
  targetLanguage: bcp47LanguageTag,
});
