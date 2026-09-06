import { z } from "zod";
import { MAX_LABEL_THREADS_PER_ACTION } from "@/utils/label/apply-thread-labels";

export const applyThreadLabelsBody = z.object({
  threadIds: z
    .array(z.string().min(1))
    .min(1)
    .max(
      MAX_LABEL_THREADS_PER_ACTION,
      "Couldn’t process this selection. Please try again.",
    ),
  labelId: z.string().min(1),
});
