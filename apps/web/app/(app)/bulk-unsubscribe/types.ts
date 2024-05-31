import { NewsletterStatus } from "@prisma/client";

export type Row = {
  name: string;
  lastUnsubscribeLink?: string | null;
  status?: NewsletterStatus | null;
  autoArchived?: { id?: string | null };
};
