import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { mapWithConcurrency } from "../map-with-concurrency";

const ACCOUNT_CONCURRENCY = 4;

export const maxDuration = 300;

const bodySchema = z.object({
  threads: z
    .array(
      z.object({
        accountId: z.string().min(1),
        threadId: z.string().min(1),
        messageIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(500),
});

type ArchiveThread = z.infer<typeof bodySchema>["threads"][number];
type ArchiveThreadRef = Pick<ArchiveThread, "accountId" | "threadId">;

export const POST = withAuth("mobile/all-inboxes/archive", async (request) => {
  const { threads } = bodySchema.parse(await request.json());
  const threadsByKey = new Map<
    string,
    Omit<ArchiveThread, "messageIds"> & { messageIds: Set<string> }
  >();
  for (const thread of threads) {
    const key = `${thread.accountId}:${thread.threadId}`;
    const existingThread = threadsByKey.get(key);
    if (existingThread) {
      for (const messageId of thread.messageIds) {
        existingThread.messageIds.add(messageId);
      }
    } else {
      threadsByKey.set(key, {
        accountId: thread.accountId,
        threadId: thread.threadId,
        messageIds: new Set(thread.messageIds),
      });
    }
  }
  const uniqueThreads = [...threadsByKey.values()].map((thread) => ({
    ...thread,
    messageIds: [...thread.messageIds],
  }));
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
  const succeeded: ArchiveThreadRef[] = [];
  const failed: ArchiveThreadRef[] = [];

  await mapWithConcurrency(
    accountIds,
    ACCOUNT_CONCURRENCY,
    async (accountId) => {
      const accountThreads = uniqueThreads.filter(
        (thread) => thread.accountId === accountId,
      );
      const account = accountsById.get(accountId);
      if (!account) {
        failed.push(...accountThreads.map(toArchiveThreadRef));
        return;
      }

      try {
        const logger = request.logger.with({ emailAccountId: account.id });
        const emailProvider = await createEmailProvider({
          emailAccountId: account.id,
          provider: account.account.provider,
          logger,
        });
        const result = await emailProvider.bulkArchiveThreads(
          accountThreads.map(({ threadId, messageIds }) => ({
            threadId,
            messageIds,
          })),
          account.email,
        );
        const succeededThreadIds = new Set(result.succeededThreadIds);
        const failedThreadIds = new Set(result.failedThreadIds);

        for (const thread of accountThreads) {
          if (
            succeededThreadIds.has(thread.threadId) &&
            !failedThreadIds.has(thread.threadId)
          ) {
            succeeded.push(toArchiveThreadRef(thread));
          } else {
            failed.push(toArchiveThreadRef(thread));
          }
        }
      } catch (error) {
        request.logger.warn("Failed to archive all-inboxes account threads", {
          error,
          emailAccountId: account.id,
        });
        failed.push(...accountThreads.map(toArchiveThreadRef));
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

function toArchiveThreadRef(thread: ArchiveThread): ArchiveThreadRef {
  return {
    accountId: thread.accountId,
    threadId: thread.threadId,
  };
}
