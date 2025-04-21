import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type MultiAccountEmailsResponse = Awaited<
  ReturnType<typeof getMultiAccountEmails>
>;

async function getMultiAccountEmails({ email }: { email: string }) {
  const user = await prisma.user.findUnique({
    where: { email },
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
  const email = request.auth.userEmail;

  const result = await getMultiAccountEmails({ email });

  return NextResponse.json(result);
});
