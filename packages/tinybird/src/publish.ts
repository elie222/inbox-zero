import { z } from "zod";
import { tb } from "./client";

const tinybirdEmail = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  gmailMessageId: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string().optional(),
  timestamp: z.number(), // date
  unsubscribeLink: z.string().optional(),
  // labels when email was saved to tinybird
  read: z.boolean(),
  sent: z.boolean(),
  draft: z.boolean(),
  inbox: z.boolean(),
  sizeEstimate: z.number().nullish(), // Estimated size in bytes
});
export type TinybirdEmail = z.infer<typeof tinybirdEmail>;

export const publishEmail = tb.buildIngestEndpoint({
  datasource: "email",
  event: tinybirdEmail,
});
