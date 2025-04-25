import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

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
      user: { select: { name: true, image: true } },
    },
    orderBy: {
      email: "asc",
    },
  });

  return { emailAccounts };
}

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await getEmailAccounts({ userId });
  return NextResponse.json(result);
});
