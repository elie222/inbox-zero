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
              id: true,
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

  // Mark each email with whether it belongs to the current user
  // Own accounts can't be removed from this form - users must go to /accounts
  const emailAccounts =
    user?.premium?.users?.flatMap((u) =>
      u.emailAccounts.map((ea) => ({
        email: ea.email,
        isOwnAccount: u.id === userId,
      })),
    ) || [];

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
