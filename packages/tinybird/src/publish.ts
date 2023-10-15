import { z } from "zod";
import { tb } from "./client";

const tinybirdEmail = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  gmailMessageId: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  timestamp: z.number(), // date
  hasUnsubscribe: z.boolean(),
  // labels when email was saved to tinybird
  read: z.boolean(),
  sent: z.boolean(),
  draft: z.boolean(),
  inbox: z.boolean(),
});
export type TinybirdEmail = z.infer<typeof tinybirdEmail>;

export const publishEmail = tb.buildIngestEndpoint({
  datasource: "email__v3",
  event: tinybirdEmail,
});
