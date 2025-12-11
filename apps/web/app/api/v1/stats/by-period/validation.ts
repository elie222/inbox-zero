import { z } from "zod";
import { zodPeriod } from "@inboxzero/tinybird";

export const statsByPeriodQuerySchema = z.object({
  period: zodPeriod.optional().default("week"),
  fromDate: z.coerce.number().optional(),
  toDate: z.coerce.number().optional(),
  email: z.string().optional(),
});

export const statsByPeriodResponseSchema = z.object({
  result: z.array(
    z.object({
      startOfPeriod: z.string(),
      All: z.number(),
      Sent: z.number(),
      Read: z.number(),
      Unread: z.number(),
      Unarchived: z.number(),
      Archived: z.number(),
    }),
  ),
  allCount: z.number(),
  inboxCount: z.number(),
  readCount: z.number(),
  sentCount: z.number(),
});

export type StatsByPeriodResult = z.infer<typeof statsByPeriodResponseSchema>;
