import { z } from "zod";

export const digestItemSchema = z.object({
  content: z.string(),
  from: z.string(),
  subject: z.string(),
});

export const digestCategorySchema = z.enum([
  "newsletter",
  "receipt",
  "marketing",
  "calendar",
  "coldEmail",
  "notification",
  "toReply",
]);

export const digestSchema = z.object({
  newsletter: z.array(digestItemSchema).optional(),
  receipt: z.array(digestItemSchema).optional(),
  marketing: z.array(digestItemSchema).optional(),
  calendar: z.array(digestItemSchema).optional(),
  coldEmail: z.array(digestItemSchema).optional(),
  notification: z.array(digestItemSchema).optional(),
  toReply: z.array(digestItemSchema).optional(),
});

export const sendDigestEmailBody = z.object({ emailAccountId: z.string() });

export type Digest = z.infer<typeof digestSchema>;
