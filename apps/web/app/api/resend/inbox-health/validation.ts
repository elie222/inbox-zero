import { z } from "zod";

export const sendInboxHealthEmailBody = z.object({
  emailAccountId: z.string(),
});

export type SendInboxHealthEmailBody = z.infer<typeof sendInboxHealthEmailBody>;
