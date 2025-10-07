import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type GetEmailAccountsResponse = Awaited<
  ReturnType<typeof getEmailAccounts>
>;

async function getEmailAccounts({ userId }: { userId: string }) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: {
      id: true,
      email: true,
      accountId: true,
      name: true,
      image: true,
      account: {
        select: {
          provider: true,
        },
      },
      user: {
        select: {
          name: true,
          image: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const accountsWithNames = emailAccounts.map((account) => {
    // Old accounts don't have a name attached, so use the name from the user
    if (account.user.email === account.email) {
      return {
        ...account,
        name: account.name || account.user.name,
        image: account.image || account.user.image,
        isPrimary: true,
      };
    }

    return { ...account, isPrimary: false };
  });

  return { emailAccounts: accountsWithNames };
}

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getEmailAccounts({ userId });
  return NextResponse.json(result);
});

export const OPTIONS = async () => {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Email-Account-ID",
      "Access-Control-Allow-Credentials": "true",
    },
  });
};
