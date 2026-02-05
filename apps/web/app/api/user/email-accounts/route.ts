import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import {
  LAST_EMAIL_ACCOUNT_COOKIE,
  parseLastEmailAccountCookieValue,
} from "@/utils/cookies";
import { withAuth } from "@/utils/middleware";

export type GetEmailAccountsResponse = Awaited<
  ReturnType<typeof getEmailAccounts>
>;

async function getEmailAccounts({ userId }: { userId: string }) {
  const cookieStore = await cookies();
  const lastEmailAccountId = parseLastEmailAccountCookieValue({
    userId,
    cookieValue: cookieStore.get(LAST_EMAIL_ACCOUNT_COOKIE)?.value,
  });

  const emailAccounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: {
      id: true,
      email: true,
      accountId: true,
      name: true,
      image: true,
      timezone: true,
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

  return { emailAccounts: accountsWithNames, lastEmailAccountId };
}

export const GET = withAuth("user/email-accounts", async (request) => {
  const userId = request.auth.userId;
  const result = await getEmailAccounts({ userId });
  return NextResponse.json(result);
});
