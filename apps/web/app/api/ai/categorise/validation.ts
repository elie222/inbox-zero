import { z } from "zod";

export const categoriseBody = z.object({
  threadId: z.string(),
  from: z.string(),
  subject: z.string(),
});
export type CategoriseBody = z.infer<typeof categoriseBody>;

export const categoriseBodyWithHtml = categoriseBody.extend({
  textPlain: z.string().nullable(),
  textHtml: z.string().nullable(),
  snippet: z.string().nullable(),
});
export type CategoriseBodyWithHtml = z.infer<typeof categoriseBodyWithHtml>;
