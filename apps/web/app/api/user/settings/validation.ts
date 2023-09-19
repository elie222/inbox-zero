import { z } from "zod";
import { zodAIModel } from "@/utils/openai";

export const saveSettingsBody = z.object({
  aiModel: zodAIModel.optional(),
  openAIApiKey: z.string().optional(),
});
export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
