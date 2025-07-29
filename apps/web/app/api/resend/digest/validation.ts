import { z } from "zod";
import { schema as digestEmailSummarySchema } from "@/utils/ai/digest/summarize-email-for-digest";

export type DigestEmailSummarySchema = z.infer<typeof digestEmailSummarySchema>;

export const digestItemSchema = z.object({
  from: z.string(),
  subject: z.string(),
  content: digestEmailSummarySchema,
});

export const digestSummarySchema = z.string().transform((str) => {
  try {
    return digestEmailSummarySchema.parse(JSON.parse(str));
  } catch (e) {
    throw new Error("Invalid summary JSON");
  }
});

export const digestCategorySchema = z.string();

export const digestSchema = z.record(
  z.string(),
  z.array(digestItemSchema).optional(),
);

export const sendDigestEmailBody = z.object({ emailAccountId: z.string() });

export type Digest = z.infer<typeof digestSchema>;
