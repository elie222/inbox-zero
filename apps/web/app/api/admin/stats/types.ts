import { z } from "zod";

// Epoch milliseconds on the wire, matching the org stats routes.
export const adminStatsParams = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});

export type AdminStatsParams = z.infer<typeof adminStatsParams>;
