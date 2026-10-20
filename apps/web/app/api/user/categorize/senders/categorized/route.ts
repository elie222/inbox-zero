import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { emptySenderMessageCounts } from "@/utils/bulk-archive/category-stats";
import { getSenderMessageCounts } from "@/utils/categorize/senders/get-sender-message-counts";

export type CategorizedSendersResponse = Awaited<
  ReturnType<typeof getCategorizedSenders>
>;

async function getCategorizedSenders({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [senders, categories, emailAccount, messageCounts] = await Promise.all([
    prisma.newsletter.findMany({
      where: { emailAccountId, categoryId: { not: null } },
      select: {
        id: true,
        email: true,
        name: true,
        category: { select: { id: true, description: true, name: true } },
      },
    }),
    getUserCategoriesWithRules({ emailAccountId }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { autoCategorizeSenders: true },
    }),
    getSenderMessageCounts({ emailAccountId }),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    senders: senders.map((sender) => ({
      ...sender,
      counts:
        messageCounts.get(sender.email.toLowerCase()) ??
        emptySenderMessageCounts,
    })),
    categories,
    autoCategorizeSenders: emailAccount?.autoCategorizeSenders ?? false,
  };
}

export const GET = withEmailAccount(
  "user/categorize/senders/categorized",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const result = await getCategorizedSenders({ emailAccountId });
    return NextResponse.json(result);
  },
);
