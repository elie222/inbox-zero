import { z } from "zod";

export const digestBody = z.object({
  emailAccountId: z.string(),
  actionId: z.string().optional(),
  coldEmailId: z.string().optional(),
  message: z.object({
    id: z.string(),
    threadId: z.string(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    content: z.string(),
  }),
});

export type DigestBody = z.infer<typeof digestBody>;
