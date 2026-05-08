import { z } from "zod";
import {
  MAX_AI_DRAFT_CLEANUP_DAYS,
  MIN_AI_DRAFT_CLEANUP_DAYS,
} from "@/utils/ai/draft-cleanup-settings";

export const saveAboutBody = z.object({ about: z.string().max(2000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveSignatureBody = z.object({
  signature: z.string().max(10_000),
});
export type SaveSignatureBody = z.infer<typeof saveSignatureBody>;

export const saveWritingStyleBody = z.object({
  writingStyle: z.string().max(2000),
});
export type SaveWritingStyleBody = z.infer<typeof saveWritingStyleBody>;

export const draftCleanupDaysSchema = z
  .number()
  .int()
  .min(MIN_AI_DRAFT_CLEANUP_DAYS)
  .max(MAX_AI_DRAFT_CLEANUP_DAYS);

export const updateAIDraftCleanupSettingsBody = z.object({
  cleanupDays: draftCleanupDaysSchema.nullable(),
});
