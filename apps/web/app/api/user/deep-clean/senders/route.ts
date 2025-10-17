import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { numberToPriority } from "@/utils/priority";
import { getUserCategoriesWithRules } from "@/utils/category.server";

const logger = createScopedLogger("api/user/deep-clean/senders");

export type DeepCleanSendersResponse = Awaited<
  ReturnType<typeof getDeepCleanSenders>
>;

async function getDeepCleanSenders({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const categories = await getUserCategoriesWithRules({ emailAccountId });

  const categorizedSenders = await prisma.newsletter.findMany({
    where: {
      emailAccountId,
      categoryId: { not: null },
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      priority: "desc", // Higher priority first
    },
  });

  // Get email counts for each sender
  const senderEmails = await prisma.emailMessage.groupBy({
    by: ["from"],
    where: {
      emailAccountId,
      inbox: true,
      from: {
        in: categorizedSenders.map((s) => s.email),
      },
    },
    _count: {
      from: true,
    },
  });

  const emailCountMap = new Map(
    senderEmails.map((item) => [item.from, item._count.from]),
  );

  // Create senders array with category information
  const senders = categorizedSenders.map((sender) => {
    const emailCount = emailCountMap.get(sender.email) || 0;
    const category = categories.find((c) => c.id === sender.categoryId) || null;

    return {
      email: sender.email,
      priority: sender.priority ? numberToPriority(sender.priority) : null,
      emailCount,
      category,
    };
  });

  // Sort senders by email count (descending)
  senders.sort((a, b) => b.emailCount - a.emailCount);

  logger.info("Fetched DeepClean senders", {
    emailAccountId,
    totalCategories: categories.length,
    totalSenders: senders.length,
  });

  return {
    senders,
    categories,
    totalCategorizedSenders: senders.length,
  };
}

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  logger.info("Fetching DeepClean senders", { emailAccountId });

  const data = await getDeepCleanSenders({ emailAccountId });
  return NextResponse.json(data);
});
