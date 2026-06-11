import { z } from "zod";

export const responseTimeQuerySchema = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type ResponseTimeQuery = z.infer<typeof responseTimeQuerySchema>;
