import { z } from "zod";

export const threadsQuery = z.object({
  fromEmail: z.string().nullish(),
  limit: z.coerce.number().max(100).nullish(),
  type: z.string().nullish(),
  q: z.string().nullish(),
  nextPageToken: z.string().nullish(),
  folderId: z.string().nullish(), // Outlook uses folderId instead of labelId as Google does
});
export type ThreadsQuery = z.infer<typeof threadsQuery>;
