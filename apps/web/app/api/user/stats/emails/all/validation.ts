import { z } from "zod";

export const loadIDBEmailsBody = z.object({
  loadBefore: z.coerce.boolean().optional(),
  timestamp: z.coerce.number().optional(),
});

const indexedDBEmail = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  gmailMessageId: z.string(),
  from: z.string(),
  fromDomain: z.string().optional(),
  to: z.string(),
  toDomain: z.string().optional(),
  subject: z.string().optional(),
  timestamp: z.number(),
  unsubscribeLink: z.string().optional(),
  read: z.boolean(),
  sent: z.boolean(),
  draft: z.boolean(),
  inbox: z.boolean(),
  sizeEstimate: z.number().nullish(),
});

export type IndexedDBEmail = z.infer<typeof indexedDBEmail>;

export type LoadIDBEmailsBody = z.infer<typeof loadIDBEmailsBody>;
