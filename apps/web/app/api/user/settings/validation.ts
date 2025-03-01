import { Provider } from "@/utils/llms/config";
import { z } from "zod";

export const saveSettingsBody = z
  .object({
    aiProvider: z.enum([
      Provider.ANTHROPIC,
      Provider.OPEN_AI,
      Provider.GOOGLE,
      Provider.GROQ,
      Provider.OPENROUTER,
      ...(Provider.OLLAMA ? [Provider.OLLAMA] : []),
    ]),
    aiModel: z.string(),
    aiApiKey: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.aiApiKey && val.aiProvider !== Provider.ANTHROPIC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You must provide an API key for this provider",
        path: ["aiApiKey"],
      });
    }
  });

export type SaveSettingsBody = z.infer<typeof saveSettingsBody>;
