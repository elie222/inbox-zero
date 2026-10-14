import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetSpamFilterResponse = Awaited<ReturnType<typeof getStatus>>;
export const GET = withEmailAccount("user/spam-filter", async (request) =>
  NextResponse.json(await getStatus(request.auth.emailAccountId)),
);

async function getStatus(emailAccountId: string) {
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: { userId: true, spamFilterEnabled: true },
  });
  const model = await prisma.spamModel.findUnique({
    where: { userId: account.userId },
    select: {
      status: true,
      goodMessages: true,
      spamMessages: true,
      importedWords: true,
      importedMessages: true,
      updatedAt: true,
      tokenizerVersion: true,
    },
  });
  const [filtered, corrections] = await Promise.all([
    prisma.spamDecision.count({
      where: { emailAccountId, verdict: "spam", movedAt: { not: null } },
    }),
    prisma.spamTraining.count({ where: { emailAccountId } }),
  ]);
  return { enabled: account.spamFilterEnabled, model, filtered, corrections };
}
