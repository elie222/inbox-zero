import { z } from "zod";
import { tb } from "./client";
import { decrypt, encrypt } from "./encrypt";

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
    from: z.string().transform(decrypt),
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
    to: z.string().transform(decrypt),
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
    from: z.string().transform(decrypt),
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
    to: z.string().transform(decrypt),
    count: z.number(),
  }),
});

export const getNewsletterCounts = tb.buildPipe({
  pipe: "newsletters",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
    orderBy: z.enum(["emails", "unread", "unarchived"]).optional(),
    all: z.boolean(),
    read: z.boolean(),
    unread: z.boolean(),
    archived: z.boolean(),
    unarchived: z.boolean(),
    andClause: z.boolean().optional(),
  }),
  data: z.object({
    from: z.string().transform(decrypt),
    count: z.number(),
    readEmails: z.number(),
    inboxEmails: z.number(),
    lastUnsubscribeLink: z.string().optional(),
  }),
});

export const getEmailsFromSender = tb.buildPipe({
  pipe: "emails_from_sender",
  parameters: getEmailsParameters.merge(
    z.object({ fromEmail: z.string().transform(encrypt) }),
  ),
  data: getEmailsData,
});

export const getLargestEmails = tb.buildPipe({
  pipe: "largest_emails",
  parameters: z.object({
    ownerEmail: z.string(),
    limit: z.number().nullish(),
    fromDate: z.number().nullish(),
    toDate: z.number().nullish(),
  }),
  data: z.object({
    gmailMessageId: z.string(),
    from: z.string().transform(decrypt),
    subject: z.string().transform(decrypt),
    timestamp: z.number(),
    sizeEstimate: z.number().transform((t) => t ?? 0),
  }),
});

export const getLastEmail = tb.buildPipe({
  pipe: "last_email",
  parameters: z.object({
    ownerEmail: z.string(),
    direction: z.enum(["oldest", "newest"]),
  }),
  data: z.object({
    timestamp: z.number(),
    gmailMessageId: z.string(),
  }),
});

export const getNewSenders = tb.buildPipe({
  pipe: "new_senders",
  parameters: z.object({
    ownerEmail: z.string(),
    cutOffDate: z.number(),
  }),
  data: z.object({
    gmailMessageId: z.string(),
    from: z.string().transform(decrypt),
    fromDomain: z.string().transform(decrypt),
    subject: z.string().transform(decrypt),
    timestamp: z.number(),
    unsubscribeLink: z.string().nullish(),
  }),
});

export const getWeeklyStats = tb.buildPipe({
  pipe: "weekly_stats",
  parameters: z.object({
    ownerEmail: z.string(),
    cutOffDate: z.number(),
  }),
  data: z.object({
    totalEmails: z.number(),
    readEmails: z.number(),
    sentEmails: z.number(),
    archivedEmails: z.number(),
    unsubscribeEmails: z.number(),
  }),
});
