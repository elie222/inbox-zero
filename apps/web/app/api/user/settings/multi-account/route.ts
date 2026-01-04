import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type MultiAccountEmailsResponse = Awaited<
  ReturnType<typeof getMultiAccountEmails>
>;

async function getMultiAccountEmails({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          users: {
            select: {
              emailAccounts: {
                select: { email: true },
              },
            },
          },
          admins: { select: { id: true } },
        },
      },
    },
  });

  const emailAccounts =
    user?.premium?.users.flatMap((u) => u.emailAccounts) || [];

  return {
    emailAccounts,
    admins: user?.premium?.admins || [],
  };
}

export const GET = withAuth("user/settings/multi-account", async (request) => {
  const userId = request.auth.userId;

  const result = await getMultiAccountEmails({ userId });

  return NextResponse.json(result);
});
