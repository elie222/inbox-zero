import { z } from "zod";

export const bulkSenderActionSchema = z.object({
  froms: z.array(z.string().trim().min(1)).min(1),
});

export const bulkArchiveSenderJobSchema = z.object({
  emailAccountId: z.string().min(1),
  ownerEmail: z.string().email(),
  provider: z.enum(["google", "microsoft"]),
  sender: z.string().trim().min(1),
});

export type BulkArchiveSenderJob = z.infer<typeof bulkArchiveSenderJobSchema>;
