import { z } from "zod";

export const summariseBody = z.object({ prompt: z.string() });
export type SummariseBody = z.infer<typeof summariseBody>;
