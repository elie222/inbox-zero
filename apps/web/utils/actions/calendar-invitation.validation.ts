import { z } from "zod";

export const respondToCalendarInvitationBody = z.object({
  messageId: z.string().min(1),
  response: z.enum(["accepted", "declined", "tentative"]),
});
