import { z } from "zod";
import { Frequency } from "@prisma/client";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config";

const scheduleSchema = z.object({
  intervalDays: z.number().nullable(),
  daysOfWeek: z.number().nullable(),
  timeOfDay: z.coerce.date().nullable(),
  occurrences: z.number().nullable(),
});

export const saveDigestScheduleBody = z.object({
  schedule: scheduleSchema.nullable(),
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
  schedule: scheduleSchema.nullable(),
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
      ...(Provider.OLLAMA ? [Provider.OLLAMA] : []),
    ]),
    aiModel: z.string(),
    aiApiKey: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.aiApiKey && val.aiProvider !== DEFAULT_PROVIDER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You must provide an API key for this provider",
        path: ["aiApiKey"],
      });
    }
  });
export type SaveAiSettingsBody = z.infer<typeof saveAiSettingsBody>;
