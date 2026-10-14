import { z } from "zod";

export const startBulkRunBody = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    includeRead: z.boolean().default(false),
    rerun: z.boolean().default(false),
    generateDraftReplies: z.boolean().default(false),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });
export const controlBulkRunBody = z.object({
  runId: z.string().min(1),
  command: z.enum(["pause", "resume", "stop"]),
});
