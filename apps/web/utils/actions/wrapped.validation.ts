import { z } from "zod";

export const generateWrappedBody = z.object({
  year: z.number().int().min(2020).max(2030),
});
export type GenerateWrappedBody = z.infer<typeof generateWrappedBody>;
