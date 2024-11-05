import { Provider } from "@/utils/llms/config";
import { z } from "zod";

export const saveSettingsBody = z
  .object({
    aiProvider: z.enum([Provider.ANTHROPIC, Provider.OPEN_AI]),
    aiModel: z.string(),
    aiApiKey: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.aiApiKey && val.aiProvider !== Provider.ANTHROPIC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API key is required for non-default providers",
        path: ["aiProvider"],
      });
    }
  });

export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
