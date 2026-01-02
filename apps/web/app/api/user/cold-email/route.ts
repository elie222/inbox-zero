import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import {
  ColdEmailStatus,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";

const LIMIT = 50;

export type ColdEmailsResponse = Awaited<ReturnType<typeof getColdEmails>>;

async function getColdEmails(
  {
    emailAccountId,
    status,
  }: { emailAccountId: string; status: ColdEmailStatus },
  page: number,
) {
  const coldEmailRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType: SystemType.COLD_EMAIL,
      },
    },
    select: { id: true, groupId: true },
  });

  if (!coldEmailRule?.groupId) {
    // Fallback to old ColdEmail table for users who haven't migrated yet
    const where = {
      emailAccountId,
      status,
    };

    const [oldColdEmails, count] = await Promise.all([
      prisma.coldEmail.findMany({
        where,
        take: LIMIT,
        skip: (page - 1) * LIMIT,
        orderBy: { createdAt: "desc" },
      }),
      prisma.coldEmail.count({ where }),
    ]);

    return {
      coldEmails: oldColdEmails.map((c) => ({
        id: c.id,
        fromEmail: c.fromEmail,
        status: c.status as ColdEmailStatus,
        createdAt: c.createdAt,
        reason: c.reason || undefined,
        threadId: c.threadId || undefined,
        messageId: c.messageId || undefined,
      })),
      totalPages: Math.ceil(count / LIMIT),
    };
  }

  const where = {
    groupId: coldEmailRule.groupId,
    type: GroupItemType.FROM,
    exclude: status === ColdEmailStatus.USER_REJECTED_COLD,
  };

  const [groupItems, count] = await Promise.all([
    prisma.groupItem.findMany({
      where,
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        value: true,
        createdAt: true,
        reason: true,
        threadId: true,
        messageId: true,
      },
    }),
    prisma.groupItem.count({ where }),
  ]);

  const coldEmails = groupItems.map((item) => ({
    id: item.id,
    fromEmail: item.value,
    status: status,
    createdAt: item.createdAt,
    reason: item.reason,
    threadId: item.threadId,
    messageId: item.messageId,
  }));

  return { coldEmails, totalPages: Math.ceil(count / LIMIT) };
}

export const GET = withEmailAccount("user/cold-email", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get("page") || "1");
  const status =
    (url.searchParams.get("status") as ColdEmailStatus | undefined) ||
    ColdEmailStatus.AI_LABELED_COLD;

  const result = await getColdEmails({ emailAccountId, status }, page);

  return NextResponse.json(result);
});
