import { z } from "zod";
import { NewsletterStatus } from "@prisma/client";

export const setNewsletterStatusBody = z.object({
  newsletterEmail: z.email(),
  status: z.nativeEnum(NewsletterStatus).nullable(),
});
export type SetNewsletterStatusBody = z.infer<typeof setNewsletterStatusBody>;
