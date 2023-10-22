import { z } from "zod";
import { tb } from "./client";

export const zodPeriod = z.enum(["day", "week", "month", "year"]);
export type ZodPeriod = z.infer<typeof zodPeriod>;
const zodStartOfPeriod = z.string().transform((t) => new Date(t));
const zodNumberToBoolean = z.number().transform((t) => t === 1);

const getEmailsParameters = z.object({
  ownerEmail: z.string(),
  period: zodPeriod,
  fromDate: z.number().nullish(),
  toDate: z.number().nullish(),
});

const getEmailsData = z.object({
  startOfPeriod: zodStartOfPeriod,
  count: z.number(),
});

export const getEmailsByPeriod = tb.buildPipe({
  pipe: "get_emails_by_period",
  parameters: getEmailsParameters,
  data: getEmailsData,
});

export const getReadEmailsByPeriod = tb.buildPipe({
  pipe: "get_read_emails_by_period",
  parameters: getEmailsParameters,
  data: getEmailsData.merge(z.object({ read: zodNumberToBoolean })),
});

export const getSentEmailsByPeriod = tb.buildPipe({
  pipe: "get_sent_emails_by_period",
  parameters: getEmailsParameters,
  data: getEmailsData,
});

export const getInboxEmailsByPeriod = tb.buildPipe({
  pipe: "get_inbox_emails_by_period",
  parameters: getEmailsParameters,
  data: getEmailsData.merge(z.object({ inbox: zodNumberToBoolean })),
});
