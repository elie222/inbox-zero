import { z } from "zod";
import { tb } from "./client";

export const zodPeriod = z.enum(["day", "week", "month", "year"]);
export type ZodPeriod = z.infer<typeof zodPeriod>;

export const getEmailActionsByDay = tb.buildPipe({
  pipe: "get_email_actions_by_period",
  parameters: z.object({
    ownerEmail: z.string(),
  }),
  data: z.object({
    date: z.string(),
    archive_count: z.number(),
    delete_count: z.number(),
  }),
});
