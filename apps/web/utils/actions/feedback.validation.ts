import { z } from "zod";

export const submitFeedbackBody = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, "Feedback is required")
    .max(5000, "Feedback must be 5000 characters or less"),
});
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackBody>;
