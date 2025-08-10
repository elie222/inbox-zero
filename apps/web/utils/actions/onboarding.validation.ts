import { z } from "zod";

export const stepWhoBody = z.object({
  role: z.string().min(1, "Please select your role."),
});

export type StepWhoBody = z.infer<typeof stepWhoBody>;
