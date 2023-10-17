import { z } from "zod";
import { tb } from "./client";

export const getEmailsByWeek = tb.buildPipe({
  pipe: "get_emails_by_week__v2",
  parameters: z.object({
    ownerEmail: z.string(),
  }),
  data: z.object({
    week_start: z.string().transform((t) => new Date(t)),
    count: z.number(),
  }),
});

export const getReadEmailsByWeek = tb.buildPipe({
  pipe: "get_read_emails_by_week__v1",
  parameters: z.object({
    ownerEmail: z.string(),
  }),
  data: z.object({
    week_start: z.string().transform((t) => new Date(t)),
    read: z.number().transform((t) => t === 1),
    count: z.number(),
  }),
});

export const getSentEmailsByWeek = tb.buildPipe({
  pipe: "get_sent_emails_by_week__v1",
  parameters: z.object({
    ownerEmail: z.string(),
  }),
  data: z.object({
    week_start: z.string().transform((t) => new Date(t)),
    count: z.number(),
  }),
});
