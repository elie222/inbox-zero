import { z } from "zod";

export const createGroupBody = z.object({
  name: z.string(),
  prompt: z.string().optional(),
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;
