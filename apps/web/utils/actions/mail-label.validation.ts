import { z } from "zod";

export const applyThreadLabelsBody = z.object({
  threadIds: z
    .array(z.string().min(1))
    .min(1)
    .max(500, "Select up to 500 conversations at a time."),
  labelId: z.string().min(1),
});
