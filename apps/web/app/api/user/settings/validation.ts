import { zodAIModel } from "@/utils/openai";
import { z } from "zod";

export const saveSettingsBody = z
  .object({
    aiModel: z
      .string()
      .optional()
      .refine((val) => !val || val.startsWith("gpt-"), {
        message: "Model must start with 'gpt-'.",
      }),
    openAIApiKey: z
      .string()
      .refine((val) => !val || val.startsWith("sk-"), {
        message: "API key must start with 'sk-'.",
      })
      .refine((val) => !val || val.length === 51, {
        message: "API key must be 51 characters long.",
      })
      .optional(),
  })
  .superRefine((val) => {
    // if openai key is not set, model must be zodAIModel
    if (!val.openAIApiKey) zodAIModel.parse(val.aiModel);
    return true;
  });
export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
