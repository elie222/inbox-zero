import { z } from "zod";

export const threadsQuery = z.object({
  fromEmail: z.string().nullish(),
  limit: z.coerce.number().max(100).nullish(),
  type: z.string().nullish(),
  nextPageToken: z.string().nullish(),
  labelId: z.string().nullish(), // For Google
  after: z.coerce.date().nullish(),
  before: z.coerce.date().nullish(),
  isUnread: z.coerce.boolean().nullish(),
});
export type ThreadsQuery = z.infer<typeof threadsQuery>;
