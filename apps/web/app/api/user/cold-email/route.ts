import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ColdEmailStatus } from "@prisma/client";

const LIMIT = 50;

export type ColdEmailsResponse = Awaited<ReturnType<typeof getColdEmails>>;

async function getColdEmails(options: { userId: string }, page: number) {
  const [coldEmails, count] = await Promise.all([
    prisma.newsletter.findMany({
      where: {
        userId: options.userId,
        coldEmail: ColdEmailStatus.COLD_EMAIL,
      },
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        status: true,
        createdAt: true,
        coldEmailReason: true,
      },
    }),
    prisma.newsletter.count({
      where: { userId: options.userId, coldEmail: ColdEmailStatus.COLD_EMAIL },
    }),
  ]);

  return { coldEmails, totalPages: Math.ceil(count / LIMIT) };
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" });

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");

  const result = await getColdEmails({ userId: session.user.id }, page);

  return NextResponse.json(result);
});
