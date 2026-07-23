import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { mapWithConcurrency } from "../summary";

const ARCHIVE_CONCURRENCY = 4;
const ACCOUNT_CONCURRENCY = 4;

const bodySchema = z.object({
  threads: z
    .array(
      z.object({
        accountId: z.string().min(1),
        threadId: z.string().min(1),
      }),
    )
    .min(1)
    .max(500),
});

export const POST = withAuth("mobile/all-inboxes/archive", async (request) => {
  const { threads } = bodySchema.parse(await request.json());
  const uniqueThreads = [
    ...new Map(
      threads.map((thread) => [
        `${thread.accountId}:${thread.threadId}`,
        thread,
      ]),
    ).values(),
  ];
  const accountIds = [
    ...new Set(uniqueThreads.map((thread) => thread.accountId)),
  ];
  const accounts = await prisma.emailAccount.findMany({
    where: {
      id: { in: accountIds },
      userId: request.auth.userId,
      account: { disconnectedAt: null },
    },
    select: {
      id: true,
      email: true,
      account: {
        select: { provider: true },
      },
    },
  });
  const accountsById = new Map(
    accounts.map((account) => [account.id, account]),
  );
  const succeeded: typeof uniqueThreads = [];
  const failed: typeof uniqueThreads = [];

  await mapWithConcurrency(
    accountIds,
    ACCOUNT_CONCURRENCY,
    async (accountId) => {
      const accountThreads = uniqueThreads.filter(
        (thread) => thread.accountId === accountId,
      );
      const account = accountsById.get(accountId);
      if (!account) {
        failed.push(...accountThreads);
        return;
      }

      try {
        const logger = request.logger.with({ emailAccountId: account.id });
        const emailProvider = await createEmailProvider({
          emailAccountId: account.id,
          provider: account.account.provider,
          logger,
        });
        await mapWithConcurrency(
          accountThreads,
          ARCHIVE_CONCURRENCY,
          async (thread) => {
            try {
              await emailProvider.archiveThreadWithLabel(
                thread.threadId,
                account.email,
              );
              succeeded.push(thread);
            } catch (error) {
              logger.warn("Failed to archive all-inboxes thread", {
                error,
                threadId: thread.threadId,
              });
              failed.push(thread);
            }
          },
        );
      } catch (error) {
        request.logger.warn(
          "Failed to initialize all-inboxes archive provider",
          {
            error,
            emailAccountId: account.id,
          },
        );
        failed.push(...accountThreads);
      }
    },
  );

  return NextResponse.json({
    archived: succeeded.length,
    total: uniqueThreads.length,
    succeeded,
    failed,
  });
});
