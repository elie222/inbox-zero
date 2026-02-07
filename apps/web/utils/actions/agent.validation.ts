import { z } from "zod";

export const agentApprovalBody = z.object({
  approvalId: z.string().min(1),
});

export const toggleAllowedActionBody = z.object({
  actionType: z.string().min(1),
  enabled: z.boolean(),
});
export type ToggleAllowedActionBody = z.infer<typeof toggleAllowedActionBody>;

export const createSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
});

export const updateSkillBody = z.object({
  skillId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const deleteSkillBody = z.object({
  skillId: z.string().min(1),
});
