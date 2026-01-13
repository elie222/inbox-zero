import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { getUserCategoriesWithRules } from "@/utils/category.server";

export type CategorizedSendersResponse = Awaited<
  ReturnType<typeof getCategorizedSenders>
>;

async function getCategorizedSenders({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [senders, categories, emailAccount, senderNames] = await Promise.all([
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
      select: { autoCategorizeSenders: true, bulkArchiveAction: true },
    }),
    // Get sender names from EmailMessage table (same source as bulk-unsubscribe)
    prisma.emailMessage.groupBy({
      by: ["from"],
      where: {
        emailAccountId,
        fromName: { not: null },
      },
      _max: {
        fromName: true,
      },
    }),
  ]);

  // Create a map of email -> fromName from EmailMessage
  const senderNameMap = new Map<string, string>();
  for (const msg of senderNames) {
    if (msg._max.fromName) {
      senderNameMap.set(msg.from, msg._max.fromName);
    }
  }

  // Merge sender names: prefer Newsletter.name, fallback to EmailMessage.fromName
  const sendersWithNames = senders.map((sender) => ({
    ...sender,
    name: sender.name || senderNameMap.get(sender.email) || null,
  }));

  return {
    senders: sendersWithNames,
    categories,
    autoCategorizeSenders: emailAccount?.autoCategorizeSenders ?? false,
    bulkArchiveAction: emailAccount?.bulkArchiveAction ?? "ARCHIVE",
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
