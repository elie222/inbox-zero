import { z } from "zod";
import { tb } from "./client";
import { encrypt } from "./encrypt";

const tinybirdEmail = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  gmailMessageId: z.string(),
  from: z.string().transform(encrypt),
  fromDomain: z
    .string()
    .optional()
    .transform((s) => s && encrypt(s)),
  to: z.string().transform(encrypt),
  toDomain: z
    .string()
    .optional()
    .transform((s) => s && encrypt(s)),
  subject: z
    .string()
    .optional()
    .transform((s) => s && encrypt(s)),
  timestamp: z.number(), // date
  unsubscribeLink: z.string().optional(),
  // labels when email was saved to tinybird
  read: z.boolean(),
  sent: z.boolean(),
  draft: z.boolean(),
  inbox: z.boolean(),
  sizeEstimate: z.number().default(0), // Estimated size in bytes
});
export type TinybirdEmail = z.infer<typeof tinybirdEmail>;

export const publishEmail = tb.buildIngestEndpoint({
  datasource: "email",
  event: tinybirdEmail,
});

const tinybirdEmailAction = z.object({
  ownerEmail: z.string(),
  threadId: z.string(),
  action: z.enum(["archive", "delete"]),
  actionSource: z.enum(["user", "automation"]),
  timestamp: z.number(),
});

export type TinybirdEmailAction = z.infer<typeof tinybirdEmailAction>;

export const publishEmailAction = tb.buildIngestEndpoint({
  datasource: "email_action",
  event: tinybirdEmailAction,
});

// Helper functions for specific actions
export const publishArchive = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "archive" });
};

export const publishDelete = (params: Omit<TinybirdEmailAction, "action">) => {
  return publishEmailAction({ ...params, action: "delete" });
};
