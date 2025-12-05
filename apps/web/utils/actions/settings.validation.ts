import { z } from "zod";
import { Frequency } from "@/generated/prisma/enums";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config.shared";

export const saveDigestScheduleBody = z.object({
  intervalDays: z.number().nullable(),
  daysOfWeek: z.number().nullable(),
  timeOfDay: z.coerce.date().nullable(),
  occurrences: z.number().nullable(),
});
export type SaveDigestScheduleBody = z.infer<typeof saveDigestScheduleBody>;

export const saveEmailUpdateSettingsBody = z.object({
  statsEmailFrequency: z.enum([Frequency.WEEKLY, Frequency.NEVER]),
  summaryEmailFrequency: z.enum([Frequency.WEEKLY, Frequency.NEVER]),
  digestEmailFrequency: z.enum([
    Frequency.DAILY,
    Frequency.WEEKLY,
    Frequency.NEVER,
  ]),
});
export type SaveEmailUpdateSettingsBody = z.infer<
  typeof saveEmailUpdateSettingsBody
>;

export const saveAiSettingsBody = z
  .object({
    aiProvider: z.enum([
      DEFAULT_PROVIDER,
      Provider.ANTHROPIC,
      Provider.OPEN_AI,
      Provider.GOOGLE,
      Provider.GROQ,
      Provider.OPENROUTER,
      Provider.AI_GATEWAY,
      Provider.OLLAMA,
      Provider.LM_STUDIO,
    ]),
    aiModel: z.string(),
    aiApiKey: z.string().optional(),
    aiBaseUrl: z.string().url().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    const requiresApiKey =
      val.aiProvider !== DEFAULT_PROVIDER &&
      val.aiProvider !== Provider.OLLAMA &&
      val.aiProvider !== Provider.LM_STUDIO;

    if (!val.aiApiKey && requiresApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You must provide an API key for this provider",
        path: ["aiApiKey"],
      });
    }

    // aiBaseUrl is required for LM Studio
    if (val.aiProvider === Provider.LM_STUDIO && !val.aiBaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Server URL is required for LM Studio",
        path: ["aiBaseUrl"],
      });
    }

    // aiBaseUrl is only valid for Ollama, OpenAI, and LM Studio providers
    if (
      val.aiBaseUrl &&
      val.aiProvider !== Provider.OLLAMA &&
      val.aiProvider !== Provider.OPEN_AI &&
      val.aiProvider !== Provider.LM_STUDIO
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Server URL is only supported for Ollama, OpenAI, and LM Studio providers",
        path: ["aiBaseUrl"],
      });
    }
  });
export type SaveAiSettingsBody = z.infer<typeof saveAiSettingsBody>;

export const updateDigestItemsBody = z.object({
  ruleDigestPreferences: z.record(z.string(), z.boolean()),
});
export type UpdateDigestItemsBody = z.infer<typeof updateDigestItemsBody>;
