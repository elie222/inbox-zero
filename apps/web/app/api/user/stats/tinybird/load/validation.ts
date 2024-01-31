import { z } from "zod";

export const loadTinybirdEmailsBody = z.object({
  loadBefore: z.coerce.boolean().optional(),
});
export type LoadTinybirdEmailsBody = z.infer<typeof loadTinybirdEmailsBody>;
