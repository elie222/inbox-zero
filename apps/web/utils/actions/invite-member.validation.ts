import { z } from "zod";

export const inviteMemberBody = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .transform((val) => val.trim().toLowerCase()),
  role: z.enum(["owner", "admin", "member"]),
  organizationId: z.string().min(1, "Organization ID is required"),
});
export type InviteMemberBody = z.infer<typeof inviteMemberBody>;
