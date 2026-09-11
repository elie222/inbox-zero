import { z } from "zod";
import { NewsletterStatus } from "@/generated/prisma/enums";

export const setSenderStatusBody = z.object({
  senderEmail: z.string().email(),
  status: z.nativeEnum(NewsletterStatus).nullable(),
  // Label the sender's mail as well as archiving it. Only used with AUTO_ARCHIVED.
  labelId: z.string().optional(),
  labelName: z.string().optional(),
});
export type SetSenderStatusBody = z.infer<typeof setSenderStatusBody>;

export const unsubscribeSenderBody = z.object({
  senderEmail: z.string().email(),
  unsubscribeLink: z.string().optional().nullable(),
  listUnsubscribeHeader: z.string().optional().nullable(),
});
export type UnsubscribeSenderBody = z.infer<typeof unsubscribeSenderBody>;
