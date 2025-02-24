import { z } from "zod";
import { GroupItemType } from "@prisma/client";

export const addGroupItemBody = z.object({
  groupId: z.string(),
  type: z.enum([GroupItemType.FROM, GroupItemType.SUBJECT]),
  value: z.string(),
});
export type AddGroupItemBody = z.infer<typeof addGroupItemBody>;
