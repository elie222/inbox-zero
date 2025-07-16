import { z } from "zod";
import { GroupItemType } from "@prisma/client";

export const createGroupBody = z.object({
  ruleId: z.string().min(1, "Rule ID is required"),
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;

export const addGroupItemBody = z.object({
  groupId: z.string(),
  type: z.enum([GroupItemType.FROM, GroupItemType.SUBJECT]),
  value: z.string(),
  exclude: z.boolean().optional(),
});
export type AddGroupItemBody = z.infer<typeof addGroupItemBody>;
