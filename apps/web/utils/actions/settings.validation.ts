import { z } from "zod";
import { Frequency } from "@/generated/prisma/enums";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config";
import { SENSITIVE_DATA_POLICIES } from "@/utils/dlp/sensitive-content";

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

export const saveAiSettingsBody = z.object({
  aiProvider: z.enum([
    DEFAULT_PROVIDER,
    Provider.ANTHROPIC,
    Provider.OPEN_AI,
    Provider.AZURE,
    Provider.GOOGLE,
    Provider.GROQ,
    Provider.OPENROUTER,
  ]),
  aiModel: z.string(),
  aiApiKey: z.string().optional(),
});
export type SaveAiSettingsBody = z.infer<typeof saveAiSettingsBody>;

export const saveSensitiveDataPolicyBody = z.object({
  sensitiveDataPolicy: z.enum(SENSITIVE_DATA_POLICIES),
});
export type SaveSensitiveDataPolicyBody = z.infer<
  typeof saveSensitiveDataPolicyBody
>;

export const updateDigestItemsBody = z.object({
  ruleDigestPreferences: z.record(z.string(), z.boolean()),
});
export type UpdateDigestItemsBody = z.infer<typeof updateDigestItemsBody>;

export const toggleDigestBody = z.object({
  enabled: z.boolean(),
  timeOfDay: z.coerce.date().optional(),
});
export type ToggleDigestBody = z.infer<typeof toggleDigestBody>;
