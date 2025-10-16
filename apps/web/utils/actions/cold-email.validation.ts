import { z } from "zod";

export const coldEmailBlockerBody = z.object({
  from: z.string(),
  subject: z.string(),
  textHtml: z.string().nullable(),
  textPlain: z.string().nullable(),
  snippet: z.string().nullable(),
  // Hacky fix. Not sure why this happens. Is internalDate sometimes a string and sometimes a number?
  date: z.string().or(z.number()).optional(),
  threadId: z.string().nullable(),
  messageId: z.string().nullable(),
});
export type ColdEmailBlockerBody = z.infer<typeof coldEmailBlockerBody>;

export const markNotColdEmailBody = z.object({ sender: z.string() });
export type MarkNotColdEmailBody = z.infer<typeof markNotColdEmailBody>;
