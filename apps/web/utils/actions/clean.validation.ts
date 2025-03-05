import { z } from "zod";

export const cleanInboxSchema = z.object({
  daysOld: z.number().default(7),
  prompt: z.string().optional(),
});

export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;
