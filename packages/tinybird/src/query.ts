import { z } from "zod";
import { isTinybirdEnabled, tb } from "./client";

export const zodPeriod = z.enum(["day", "week", "month", "year"]);
export type ZodPeriod = z.infer<typeof zodPeriod>;

const emailActionsByDaySchema = z.object({
  date: z.string(),
  archive_count: z.number(),
  delete_count: z.number(),
});

type EmailActionsByDay = z.infer<typeof emailActionsByDaySchema>;

const tinybirdGetEmailActionsByDay = tb.buildPipe({
  pipe: "get_email_actions_by_period",
  parameters: z.object({
    ownerEmail: z.string(),
  }),
  data: emailActionsByDaySchema,
});

export async function getEmailActionsByDay(params: {
  ownerEmail: string;
}): Promise<{ data: EmailActionsByDay[] }> {
  if (!isTinybirdEnabled()) {
    return { data: [] };
  }
  return tinybirdGetEmailActionsByDay(params);
}
