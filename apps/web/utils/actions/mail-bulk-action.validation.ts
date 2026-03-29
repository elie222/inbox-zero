import { z } from "zod";

export const bulkSenderActionSchema = z.object({
  froms: z.array(z.string().trim().min(1)).min(1),
});
