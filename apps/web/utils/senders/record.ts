import type { NewsletterStatus } from "@/generated/prisma/enums";
import { canonicalizeEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";

type NewsletterRecordChanges = {
  categoryId?: string | null;
  lastAnalyzedAt?: Date | null;
  name?: string | null;
  patternAnalyzed?: boolean;
  status?: NewsletterStatus | null;
};

export function extractEmailOrThrow(newsletterEmail: string) {
  const email = canonicalizeEmailAddress(newsletterEmail);
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

  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Newsletter"
    WHERE "emailAccountId" = ${emailAccountId}
      AND LOWER("email") = ${email}
  `;

  if (existing.length > 0) {
    const [updated] = await prisma.newsletter.updateManyAndReturn({
      where: { id: { in: existing.map(({ id }) => id) } },
      data: changes,
    });

    if (updated) return updated;
  }

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
