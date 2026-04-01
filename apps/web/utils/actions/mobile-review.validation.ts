import { z } from "zod";

export const signInSchema = z.object({
  code: z.string().trim().min(1).max(128),
});

export type SignInInput = z.infer<typeof signInSchema>;
