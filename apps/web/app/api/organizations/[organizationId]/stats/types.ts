import { z } from "zod";

export const orgStatsParams = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type OrgStatsParams = z.infer<typeof orgStatsParams>;
