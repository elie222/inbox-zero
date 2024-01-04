import { z } from "zod";
import { zodAIModel } from "@/utils/openai";

export const saveSettingsBody = z.object({
  aiModel: zodAIModel.optional(),
  openAIApiKey: z
    .string()
    .refine((val) => !val || val.startsWith("sk-"), {
      message: "API key must start with 'sk-'.",
    })
    .refine((val) => !val || val.length === 51, {
      message: "API key must be 51 characters long.",
    })
    .optional(),
});
export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
