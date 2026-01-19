import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { getUserCategoriesWithRules } from "@/utils/category.server";
import { Prisma } from "@/generated/prisma/client";

export type CategorizedSendersResponse = Awaited<
  ReturnType<typeof getCategorizedSenders>
>;

async function getCategorizedSenders({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [senders, categories, emailAccount] = await Promise.all([
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
  ]);

  // Get sender names from EmailMessage table for senders that don't have a name stored
  const senderEmails = senders.filter((s) => !s.name).map((s) => s.email);

  let senderNamesMap: Record<string, string> = {};

  if (senderEmails.length > 0) {
    const senderNames = await prisma.$queryRaw<
      { from: string; fromName: string | null }[]
    >(Prisma.sql`
      SELECT "from", MAX("fromName") as "fromName"
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId}
        AND "from" IN (${Prisma.join(senderEmails)})
        AND "fromName" IS NOT NULL
        AND "fromName" != ''
      GROUP BY "from"
    `);

    senderNamesMap = Object.fromEntries(
      senderNames.map((s) => [s.from, s.fromName || ""]),
    );
  }

  // Merge sender names into senders
  const sendersWithNames = senders.map((sender) => ({
    ...sender,
    name: sender.name || senderNamesMap[sender.email] || null,
  }));

  return {
    senders: sendersWithNames,
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
