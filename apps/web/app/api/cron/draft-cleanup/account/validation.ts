import { z } from "zod";

export const draftCleanupAccountBody = z.object({
  emailAccountId: z.string(),
});

export type DraftCleanupAccountBody = z.infer<typeof draftCleanupAccountBody>;
