import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/accounts");

export type GetAccountsResponse = Awaited<ReturnType<typeof getAccounts>>;

async function getAccounts({ userId }: { userId: string }) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: {
      email: true,
      accountId: true,
      user: { select: { name: true, image: true } },
    },
    orderBy: {
      email: "asc",
    },
  });

  return { accounts };
}

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await getAccounts({ userId });
  return NextResponse.json(result);
});
