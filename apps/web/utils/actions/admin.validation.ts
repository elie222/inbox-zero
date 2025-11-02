import { z } from "zod";

export const hashEmailBody = z.object({
  email: z.string().min(1, "Value is required"),
});
export type HashEmailBody = z.infer<typeof hashEmailBody>;

export const convertGmailUrlBody = z.object({
  rfc822MessageId: z.string().min(1, "RFC822 Message-ID is required"),
  email: z.string().email("Valid email address is required"),
});
export type ConvertGmailUrlBody = z.infer<typeof convertGmailUrlBody>;
