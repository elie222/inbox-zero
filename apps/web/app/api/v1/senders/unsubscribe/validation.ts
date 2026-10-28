import { z } from "zod";

export const unsubscribeSenderRequestSchema = z.object({
  senderEmail: z.string().email(),
  unsubscribeLink: z.string().url().optional(),
  listUnsubscribeHeader: z.string().min(1).optional(),
});

export const unsubscribeSenderResponseSchema = z.object({
  senderEmail: z.string().email(),
  status: z.enum(["UNSUBSCRIBED"]).nullable(),
  unsubscribe: z.object({
    attempted: z.boolean(),
    success: z.boolean(),
    method: z.enum(["post", "get", "form", "browser"]).optional(),
    statusCode: z.number().int().optional(),
    reason: z
      .enum([
        "no_unsubscribe_url",
        "unsafe_unsubscribe_url",
        "request_timeout",
        "request_failed",
        "needs_user",
        "request_rejected",
      ])
      .optional(),
  }),
});

export type UnsubscribeSenderRequest = z.infer<
  typeof unsubscribeSenderRequestSchema
>;
export type UnsubscribeSenderApiResponse = z.infer<
  typeof unsubscribeSenderResponseSchema
>;
