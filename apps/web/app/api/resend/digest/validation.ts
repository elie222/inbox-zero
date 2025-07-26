import { z } from "zod";

export const digestEmailSummarySchema = z.union([
  z.object({
    entries: z
      .array(
        z.object({
          label: z.string().describe("The label of the summarized item"),
          value: z.string().describe("The value of the summarized item"),
        }),
      )
      .nullish()
      .describe("An array of items summarizing the email content"),
  }),
  z.object({
    summary: z.string().nullish().describe("A summary of the email content"),
  }),
]);

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
