import { z } from "zod";
import { tb } from "./client";

const zodPeriod = z.enum(["day", "week", "month", "year"]);
const zodStartOfPeriod = z.string().transform((t) => new Date(t));
const zodNumberToBoolean = z.number().transform((t) => t === 1);

const getEmailsParameters = z.object({
  ownerEmail: z.string(),
  period: zodPeriod,
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

const getEmailsData = z.object({
  startOfPeriod: zodStartOfPeriod,
  count: z.number(),
});

export const getEmailsByWeek = tb.buildPipe({
  pipe: "get_emails_by_week__v3",
  parameters: getEmailsParameters,
  data: getEmailsData,
});

export const getReadEmailsByWeek = tb.buildPipe({
  pipe: "get_read_emails_by_week__v2",
  parameters: getEmailsParameters,
  data: getEmailsData.merge(z.object({ read: zodNumberToBoolean })),
});

export const getSentEmailsByWeek = tb.buildPipe({
  pipe: "get_sent_emails_by_week__v2",
  parameters: getEmailsParameters,
  data: getEmailsData,
});

export const getInboxEmailsByWeek = tb.buildPipe({
  pipe: "get_inbox_emails_by_week__v1",
  parameters: getEmailsParameters,
  data: getEmailsData.merge(z.object({ inbox: zodNumberToBoolean })),
});
