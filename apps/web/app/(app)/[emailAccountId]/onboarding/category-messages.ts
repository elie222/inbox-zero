import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { SystemType } from "@/generated/prisma/enums";

// The English tooltipText in utils/rule/consts is also read by server code,
// so the UI keeps its translatable copies here.
export const CATEGORY_TOOLTIP_MESSAGES: Partial<
  Record<SystemType, MessageDescriptor>
> = {
  TO_REPLY: msg`Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses`,
  NEWSLETTER: msg`Newsletters, blogs, and publications`,
  MARKETING: msg`Promotional emails about sales and offers`,
  CALENDAR: msg`Events, appointments, and reminders`,
  RECEIPT: msg`Invoices, receipts, and payments`,
  NOTIFICATION: msg`Alerts, status updates, and system messages`,
  OTP: msg`One-time passwords, 2FA codes, and sign-in links`,
  COLD_EMAIL: msg`Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before`,
};

// Outlook calls labels categories.
export const OUTLOOK_CATEGORY_TOOLTIP_MESSAGES: Partial<
  Record<SystemType, MessageDescriptor>
> = {
  TO_REPLY: msg`Emails you need to reply to and those where you're awaiting a reply. The category will update automatically as the conversation progresses`,
};
