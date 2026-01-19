import { z } from "zod";

export const querySchema = z.object({
  limit: z.preprocess(
    (v) => (v === null ? undefined : v),
    z.coerce.number().min(1).max(100).default(20),
  ),
  offset: z.preprocess(
    (v) => (v === null ? undefined : v),
    z.coerce.number().min(0).default(0),
  ),
});

export type GetFilingsQuery = z.infer<typeof querySchema>;
