import { z } from "zod";

export const loadTinybirdEmailsBody = z.object({
  loadBefore: z.coerce.boolean().optional(),
  timestamp: z.coerce.number().optional(),
});
export type LoadTinybirdEmailsBody = z.infer<typeof loadTinybirdEmailsBody>;
export type LoadIDBEmailsBody = z.infer<typeof loadTinybirdEmailsBody>;
