import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type FastmailSyncStatus = Awaited<ReturnType<typeof getData>>;
export const GET = withEmailAccount("fastmail/status", async (request) =>
  Response.json(await getData(request.auth.emailAccountId)),
);

async function getData(emailAccountId: string) {
  const [account, pendingCount, failedCount] = await Promise.all([
    prisma.emailAccount.findFirst({
      where: { id: emailAccountId, account: { provider: "fastmail" } },
      select: { lastPolledAt: true },
    }),
    prisma.fastmailSyncItem.count({
      where: { emailAccountId, processedAt: null },
    }),
    prisma.fastmailSyncItem.count({
      where: { emailAccountId, processedAt: null, attempts: { gt: 0 } },
    }),
  ]);
  return {
    lastSuccessfulSync: account?.lastPolledAt?.toISOString() ?? null,
    pendingCount,
    failedCount,
  };
}
