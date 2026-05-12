import { z } from "zod";

export const hashEmailBody = z.object({
  email: z.string().min(1, "Value is required"),
});
export type HashEmailBody = z.infer<typeof hashEmailBody>;

export const convertGmailUrlBody = z.object({
  rfc822MessageId: z.string().trim().min(1, "RFC822 Message-ID is required"),
  email: z.string().trim().email("Valid email address is required"),
});
export type ConvertGmailUrlBody = z.infer<typeof convertGmailUrlBody>;

export const getLabelsBody = z.object({
  emailAccountId: z.string().min(1, "Email account ID is required"),
});
export type GetLabelsBody = z.infer<typeof getLabelsBody>;

export const watchEmailsBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
});
export type WatchEmailsBody = z.infer<typeof watchEmailsBody>;

export const syncStripeForUserBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
});
export type SyncStripeForUserBody = z.infer<typeof syncStripeForUserBody>;

export const getUserInfoBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
});
export type GetUserInfoBody = z.infer<typeof getUserInfoBody>;

export const loadResponseTimeDataBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
  maxSentMessages: z.coerce.number().int().min(1).max(2000).default(500),
});
export type LoadResponseTimeDataBody = z.infer<typeof loadResponseTimeDataBody>;

export const disableAllRulesBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
});
export type DisableAllRulesBody = z.infer<typeof disableAllRulesBody>;

export const cleanupDraftsBody = z.object({
  email: z.string().trim().email("Valid email address is required"),
});
export type CleanupDraftsBody = z.infer<typeof cleanupDraftsBody>;
