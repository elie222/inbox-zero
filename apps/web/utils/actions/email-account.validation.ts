import { z } from "zod";

export const updateReferralSignatureBody = z.object({
  enabled: z.boolean(),
});

export const updateHiddenAiDraftLinksBody = z.object({
  enabled: z.boolean(),
});
