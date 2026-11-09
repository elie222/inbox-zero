import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import {
  getCategorizationProgress,
  getCategorizationStatusSnapshot,
} from "@/utils/redis/categorization-progress";

const CATEGORY_SENDER_SAMPLE_LIMIT = 5;

export async function getCategoryOverview({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [categories, inboxSenders, emailAccount, progress] = await Promise.all([
    prisma.category.findMany({
      where: { emailAccountId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    getInboxSendersByCategory({ emailAccountId }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { autoCategorizeSenders: true },
    }),
    getCategorizationProgress({ emailAccountId }),
  ]);

  const senderCountByCategory = new Map<string | null, number>();
  const sampleSendersByCategory = new Map<
    string | null,
    { email: string; name: string | null }[]
  >();
  for (const sender of inboxSenders) {
    senderCountByCategory.set(sender.categoryId, sender.senderCount);
    const samples = sampleSendersByCategory.get(sender.categoryId) ?? [];
    samples.push({ email: sender.email, name: sender.name });
    sampleSendersByCategory.set(sender.categoryId, samples);
  }

  const categorySummaries = categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    senderCount: senderCountByCategory.get(category.id) ?? 0,
    sampleSenders: sampleSendersByCategory.get(category.id) ?? [],
  }));

  return {
    autoCategorizeSenders: emailAccount?.autoCategorizeSenders ?? false,
    categorization: getCategorizationStatusSnapshot(progress),
    categorizedSenderCount: categorySummaries.reduce(
      (total, category) => total + category.senderCount,
      0,
    ),
    uncategorizedSenderCount: senderCountByCategory.get(null) ?? 0,
    categories: categorySummaries,
  };
}

// Senders whose mail is all archived are already cleaned up, so they are left
// out of both the counts and the samples.
function getInboxSendersByCategory({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return prisma.$queryRaw<
    {
      categoryId: string | null;
      email: string;
      name: string | null;
      senderCount: number;
    }[]
  >(Prisma.sql`
    WITH inbox_senders AS (
      SELECT DISTINCT LOWER("from") AS email
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId} AND inbox = true
    ),
    ranked AS (
      SELECT
        n."categoryId",
        n.email,
        n.name,
        COUNT(*) OVER (PARTITION BY n."categoryId")::int AS "senderCount",
        ROW_NUMBER() OVER (
          PARTITION BY n."categoryId" ORDER BY n."updatedAt" DESC
        ) AS rank
      FROM "Newsletter" n
      JOIN inbox_senders s ON s.email = LOWER(n.email)
      WHERE n."emailAccountId" = ${emailAccountId}
    )
    SELECT "categoryId", email, name, "senderCount"
    FROM ranked
    WHERE rank <= ${CATEGORY_SENDER_SAMPLE_LIMIT}
    ORDER BY "categoryId", rank
  `);
}
