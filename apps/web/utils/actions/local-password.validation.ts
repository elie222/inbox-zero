import { z } from "zod";

export const updateLocalPasswordBody = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: z.string().min(12, "Use at least 12 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
