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

  return {
    senders,
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
