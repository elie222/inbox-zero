import { z } from "zod";

export const cleanInboxSchema = z.object({ daysOld: z.number().default(7) });

export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;
