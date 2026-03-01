import { z } from "zod";
import { NewsletterStatus } from "@/generated/prisma/enums";

export const setNewsletterStatusBody = z.object({
  newsletterEmail: z.string().email(),
  status: z.nativeEnum(NewsletterStatus).nullable(),
});
export type SetNewsletterStatusBody = z.infer<typeof setNewsletterStatusBody>;

export const unsubscribeSenderBody = z.object({
  newsletterEmail: z.string().email(),
  unsubscribeLink: z.string().optional().nullable(),
  listUnsubscribeHeader: z.string().optional().nullable(),
});
export type UnsubscribeSenderBody = z.infer<typeof unsubscribeSenderBody>;
