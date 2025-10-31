import { z } from "zod";

export const hashEmailBody = z.object({
  email: z.string().min(1, "Value is required"),
});
export type HashEmailBody = z.infer<typeof hashEmailBody>;
