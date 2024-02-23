import { z } from "zod";

export const summariseBody = z.object({
  textHtml: z.string(),
  textPlain: z.string(),
});
export type SummariseBody = z.infer<typeof summariseBody>;
