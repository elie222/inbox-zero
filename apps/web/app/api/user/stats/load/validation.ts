import { z } from "zod";

export const loadEmailStatsBody = z.object({
  loadBefore: z.coerce.boolean().optional(),
});
export type LoadEmailStatsBody = z.infer<typeof loadEmailStatsBody>;
