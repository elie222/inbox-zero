import chunk from "lodash/chunk";
import { mapWithConcurrency } from "@/utils/async";
import { getListThreadMessageIds } from "@/app/(app)/[emailAccountId]/mail/types";
import { BULK_ARCHIVE_THREADS_ACTION_LIMIT } from "@/utils/actions/mail-bulk-action.constants";

const THREAD_ACTION_CONCURRENCY = 10;
const ACCOUNT_ACTION_CONCURRENCY = 4;

type CombinedActionThread = {
  id: string;
  account: { id: string };
};

export async function runCombinedThreadAction({
  threads,
  action,
}: {
  threads: CombinedActionThread[];
  action: (emailAccountId: string, threadId: string) => Promise<unknown>;
}) {
  const results = await mapWithConcurrency(
    threads,
    THREAD_ACTION_CONCURRENCY,
    async (thread) => {
      const threadKey = `${thread.account.id}:${thread.id}`;
      try {
        const result = await action(thread.account.id, thread.id);
        return { failed: isActionError(result), threadKey };
      } catch {
        return { failed: true, threadKey };
      }
    },
  );

  return {
    failedThreadKeys: results
      .filter((result) => result.failed)
      .map((result) => result.threadKey),
    succeededThreadKeys: results
      .filter((result) => !result.failed)
      .map((result) => result.threadKey),
  };
}

export async function runCombinedBulkArchiveAction({
  threads,
  action,
}: {
  threads: Array<
    CombinedActionThread & {
      messageIds?: string[];
      messages?: Array<{ id: string }>;
    }
  >;
  action: (
    emailAccountId: string,
    input: {
      threads: Array<{ threadId: string; messageIds: string[] }>;
    },
  ) => Promise<unknown>;
}) {
  const threadsByAccount = new Map<string, typeof threads>();
  for (const thread of threads) {
    const accountThreads = threadsByAccount.get(thread.account.id) ?? [];
    accountThreads.push(thread);
    threadsByAccount.set(thread.account.id, accountThreads);
  }
  const accountBatches = [...threadsByAccount].flatMap(
    ([emailAccountId, accountThreads]) =>
      chunk(accountThreads, BULK_ARCHIVE_THREADS_ACTION_LIMIT).map(
        (batch) => [emailAccountId, batch] as const,
      ),
  );

  const accountResults = await mapWithConcurrency(
    accountBatches,
    ACCOUNT_ACTION_CONCURRENCY,
    async ([emailAccountId, accountThreads]) => {
      try {
        const result = await action(emailAccountId, {
          threads: accountThreads.map((thread) => ({
            threadId: thread.id,
            messageIds: getListThreadMessageIds({
              messageIds: thread.messageIds,
              messages: thread.messages ?? [],
            }),
          })),
        });
        const data = getBulkArchiveResult(result);
        if (!data) {
          return accountThreads.map((thread) => ({
            failed: true,
            threadKey: `${emailAccountId}:${thread.id}`,
          }));
        }

        const succeededThreadIds = new Set(data.succeededThreadIds);
        const failedThreadIds = new Set(data.failedThreadIds);
        return accountThreads.map((thread) => ({
          failed:
            failedThreadIds.has(thread.id) ||
            !succeededThreadIds.has(thread.id),
          threadKey: `${emailAccountId}:${thread.id}`,
        }));
      } catch {
        return accountThreads.map((thread) => ({
          failed: true,
          threadKey: `${emailAccountId}:${thread.id}`,
        }));
      }
    },
  );
  const results = accountResults.flat();

  return {
    failedThreadKeys: results
      .filter((result) => result.failed)
      .map((result) => result.threadKey),
    succeededThreadKeys: results
      .filter((result) => !result.failed)
      .map((result) => result.threadKey),
  };
}

function isActionError(result: unknown) {
  return (
    isRecord(result) &&
    (Boolean(result.serverError) || Boolean(result.validationErrors))
  );
}

function getBulkArchiveResult(result: unknown) {
  if (!isRecord(result) || !isRecord(result.data)) return;
  const { failedThreadIds, succeededThreadIds } = result.data;
  if (!isStringArray(failedThreadIds) || !isStringArray(succeededThreadIds)) {
    return;
  }

  return { failedThreadIds, succeededThreadIds };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
