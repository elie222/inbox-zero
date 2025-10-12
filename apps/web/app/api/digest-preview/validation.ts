import { z } from "zod";

export const digestPreviewBody = z.object({
  categories: z.array(z.string()),
});

export type DigestPreviewBody = z.infer<typeof digestPreviewBody>;
