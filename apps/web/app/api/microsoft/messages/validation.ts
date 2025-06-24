import { z } from "zod";

export const messageQuerySchema = z.object({
  q: z.string().nullish(),
  pageToken: z.string().nullish(),
});
export type MessageQuery = z.infer<typeof messageQuerySchema>;
