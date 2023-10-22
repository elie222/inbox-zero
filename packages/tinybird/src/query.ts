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

export const getMostReceivedFrom = tb.buildPipe({
  pipe: "most_received_from",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
  }),
  data: z.object({
    from: z.string(),
    count: z.number(),
  }),
});
export const getMostSentTo = tb.buildPipe({
  pipe: "most_sent_to",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
  }),
  data: z.object({
    to: z.string(),
    count: z.number(),
  }),
});

export const getDomainsMostReceivedFrom = tb.buildPipe({
  pipe: "get_popular_senders_domains",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
  }),
  data: z.object({
    from: z.string(),
    count: z.number(),
  }),
});
export const getDomainsMostSentTo = tb.buildPipe({
  pipe: "get_popular_recipients_domains",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
  }),
  data: z.object({
    to: z.string(),
    count: z.number(),
  }),
});
