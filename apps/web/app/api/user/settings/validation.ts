import { modelOptions } from "@/utils/llms/config";
import { z } from "zod";

export const saveSettingsBody = z
  .object({
    aiProvider: z.string(),
    aiModel: z.string(),
    aiApiKey: z.string().optional(),
  })
  .superRefine((val) => {
    // if ai api key is not set, model must be a preset model
    if (!val.aiApiKey) {
      const validModels = modelOptions[val.aiProvider].map((m) => m.value);
      z.enum(validModels as [string, ...string[]]).parse(val.aiModel);
    }
    return true;
  });
export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
