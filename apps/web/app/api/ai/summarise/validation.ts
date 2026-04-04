import { z } from "zod";

const MAX_TEXT_LENGTH = 50_000;

export const summariseBody = z.object({
  textHtml: z.string().max(MAX_TEXT_LENGTH).optional(),
  textPlain: z.string().max(MAX_TEXT_LENGTH).optional(),
});
export type SummariseBody = z.infer<typeof summariseBody>;
