import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type MultiAccountEmailsResponse = Awaited<
  ReturnType<typeof getMultiAccountEmails>
>;

async function getMultiAccountEmails(options: { email: string }) {
  const user = await prisma.user.findFirstOrThrow({
    where: { email: options.email },
    select: { premium: { select: { users: { select: { email: true } } } } },
  });

  return { users: user.premium?.users || [] };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getMultiAccountEmails({ email: session.user.email });

  return NextResponse.json(result);
});
