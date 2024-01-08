import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ColdEmailStatus } from "@prisma/client";

export type ColdEmailsResponse = Awaited<ReturnType<typeof getColdEmails>>;

async function getColdEmails(options: { email: string }) {
  const result = await prisma.newsletter.findMany({
    where: {
      email: options.email,
      coldEmail: ColdEmailStatus.COLD_EMAIL,
    },
    select: {
      id: true,
      email: true,
      status: true,
      createdAt: true,
    },
  });

  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getColdEmails({ email: session.user.email });

  return NextResponse.json(result);
});
