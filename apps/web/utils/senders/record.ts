import type { NewsletterStatus } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";

type NewsletterRecordChanges = {
  categoryId?: string | null;
  name?: string | null;
  status?: NewsletterStatus | null;
};

export function extractEmailOrThrow(newsletterEmail: string) {
  const email = extractEmailAddress(newsletterEmail);
  if (!email) throw new Error("Invalid newsletter email address");
  return email;
}

export async function upsertSenderRecord({
  emailAccountId,
  newsletterEmail,
  changes,
}: {
  emailAccountId: string;
  newsletterEmail: string;
  changes: NewsletterRecordChanges;
}) {
  const email = extractEmailOrThrow(newsletterEmail);

  return prisma.newsletter.upsert({
    where: {
      email_emailAccountId: { email, emailAccountId },
    },
    create: {
      email,
      emailAccountId,
      ...changes,
    },
    update: changes,
  });
}
