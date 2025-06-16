import { z } from "zod";

export const DigestEmailSummarySchema = z
  .object({
    entries: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .nullish(),
    summary: z.string().nullish(),
  })
  .nullish();

export type DigestEmailSummarySchema = z.infer<typeof DigestEmailSummarySchema>;

export const digestItemSchema = z.object({
  from: z.string(),
  subject: z.string(),
  content: DigestEmailSummarySchema,
});

export const digestSummarySchema = z.string().transform((str) => {
  try {
    return DigestEmailSummarySchema.parse(JSON.parse(str));
  } catch (e) {
    throw new Error("Invalid summary JSON");
  }
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
