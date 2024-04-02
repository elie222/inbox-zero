import { z } from "zod";

export const createGroupBody = z.object({ name: z.string() });
export type CreateGroupBody = z.infer<typeof createGroupBody>;
