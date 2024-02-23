import { z } from "zod";

export const summariseBody = z.object({
  textHtml: z.string().optional(),
  textPlain: z.string().optional(),
});
export type SummariseBody = z.infer<typeof summariseBody>;
