import { z } from "zod";

export const removeMemberBody = z.object({
  memberId: z.string().min(1, "Member ID is required"),
});

export type RemoveMemberBody = z.infer<typeof removeMemberBody>;
