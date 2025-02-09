import { z } from "zod";

export const categorizeBody = z.object({
  threadId: z.string(),
  messageId: z.string(),
  from: z.string(),
  subject: z.string(),
});
export type CategorizeBody = z.infer<typeof categorizeBody> & {
  content: string;
  snippet: string;
  unsubscribeLink?: string;
  hasPreviousEmail: boolean;
};

export const categorizeBodyWithHtml = categorizeBody.extend({
  textPlain: z.string().nullable(),
  textHtml: z.string().nullable(),
  snippet: z.string().nullable(),
  date: z.string(),
});
export type CategorizeBodyWithHtml = z.infer<typeof categorizeBodyWithHtml>;
