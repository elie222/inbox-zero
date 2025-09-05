import { z } from "zod";

export const inviteMemberBody = z.object({
  email: z.string().email("Please enter a valid email address"),
  // skipping owner here as the first user that created the org is already the owner
  role: z.enum(["admin", "member"]),
});
export type InviteMemberBody = z.infer<typeof inviteMemberBody>;
