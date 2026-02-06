import { z } from "zod";

export const agentApprovalBody = z.object({
  approvalId: z.string().min(1),
});

export const toggleAllowedActionBody = z.object({
  actionType: z.string().min(1),
  enabled: z.boolean(),
});
export type ToggleAllowedActionBody = z.infer<typeof toggleAllowedActionBody>;
