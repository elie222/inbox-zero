import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ColdEmailStatus } from "@prisma/client";

const LIMIT = 50;

export type ColdEmailsResponse = Awaited<ReturnType<typeof getColdEmails>>;

async function getColdEmails(
  {
    emailAccountId,
    status,
  }: { emailAccountId: string; status: ColdEmailStatus },
  page: number,
) {
  const where = {
    emailAccountId,
    status,
  };

  const [coldEmails, count] = await Promise.all([
    prisma.coldEmail.findMany({
      where,
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fromEmail: true,
        status: true,
        createdAt: true,
        reason: true,
        threadId: true,
        messageId: true,
      },
    }),
    prisma.coldEmail.count({ where }),
  ]);

  return { coldEmails, totalPages: Math.ceil(count / LIMIT) };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get("page") || "1");
  const status =
    (url.searchParams.get("status") as ColdEmailStatus | undefined) ||
    ColdEmailStatus.AI_LABELED_COLD;

  const result = await getColdEmails({ emailAccountId, status }, page);

  return NextResponse.json(result);
});
