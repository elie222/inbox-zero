import { z } from "zod";

export const handleInvitationBody = z.object({
  invitationId: z.string().trim().min(1, "Invitation ID is required"),
});
export type HandleInvitationBody = z.infer<typeof handleInvitationBody>;
