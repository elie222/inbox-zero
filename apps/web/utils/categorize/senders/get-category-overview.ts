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
  const [categories, uncategorizedSenderCount, emailAccount, progress] =
    await Promise.all([
      prisma.category.findMany({
        where: { emailAccountId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          emailSenders: {
            orderBy: { updatedAt: "desc" },
            take: CATEGORY_SENDER_SAMPLE_LIMIT,
            select: {
              email: true,
              name: true,
            },
          },
          _count: {
            select: {
              emailSenders: true,
            },
          },
        },
      }),
      prisma.newsletter.count({
        where: {
          emailAccountId,
          categoryId: null,
        },
      }),
      prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { autoCategorizeSenders: true },
      }),
      getCategorizationProgress({ emailAccountId }),
    ]);

  const categorizedSenderCount = categories.reduce(
    (total, category) => total + category._count.emailSenders,
    0,
  );

  return {
    autoCategorizeSenders: emailAccount?.autoCategorizeSenders ?? false,
    categorization: getCategorizationStatusSnapshot(progress),
    categorizedSenderCount,
    uncategorizedSenderCount,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      senderCount: category._count.emailSenders,
      sampleSenders: category.emailSenders,
    })),
  };
}
