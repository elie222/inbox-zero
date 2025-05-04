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
          users: { select: { email: true } },
          admins: { select: { id: true } },
        },
      },
    },
  });

  return {
    users: user?.premium?.users || [],
    admins: user?.premium?.admins || [],
  };
}

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;

  const result = await getMultiAccountEmails({ userId });

  return NextResponse.json(result);
});
