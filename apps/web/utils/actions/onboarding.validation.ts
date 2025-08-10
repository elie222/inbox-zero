import { z } from "zod";

export const stepWhoBody = z.object({
  role: z.string().min(1, "Please select your role."),
  // about: z.string().max(2000).optional(),
});

export type StepWhoBody = z.infer<typeof stepWhoBody>;
