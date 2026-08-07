import { z } from "zod";

const bcp47LanguageTag = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(
    /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/,
    "Must be a BCP 47 language tag (e.g. en, es-ES)",
  );

export const translateBody = z.object({
  texts: z.array(z.string()).min(1).max(20),
  targetLanguage: bcp47LanguageTag,
});
export type TranslateBody = z.infer<typeof translateBody>;
