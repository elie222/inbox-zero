import { z } from "zod";

export const updateReferralSignatureBody = z.object({
  enabled: z.boolean(),
});

export const updateHiddenAiDraftLinksBody = z.object({
  enabled: z.boolean(),
});

export const updateAiDraftCleanupBody = z.object({
  aiDraftAutoCleanupEnabled: z.boolean(),
  aiDraftRetentionDays: z.coerce.number().int().min(1).max(365),
});
