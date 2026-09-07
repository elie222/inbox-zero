import type { Logger } from "@/utils/logger";
import type { EmailLabel, EmailLabels } from "@/providers/email-label-types";
import type { ThreadListItem } from "@/utils/threads/load";
import { mergePaginatedSources } from "@/utils/threads/merge-paginated-sources";
import { getThreadTimestamp } from "@/utils/threads/sort";

const ACCOUNT_CONCURRENCY = 4;

export type CombinedThreadsAccount = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string;
};

export type CombinedListThread = ThreadListItem & {
  account: Pick<CombinedThreadsAccount, "id" | "email" | "name" | "image">;
};

export async function loadCombinedThreads({
  accounts,
  cursor,
  limit,
  loadPage,
  logger,
}: {
  accounts: CombinedThreadsAccount[];
  cursor: string | null;
  limit: number;
  loadPage: (input: {
    account: CombinedThreadsAccount;
    pageToken?: string;
  }) => Promise<{
    threads: ThreadListItem[];
    nextPageToken?: string | null;
    labels?: EmailLabel[];
  }>;
  logger: Logger;
}) {
  const { items, metaBySourceId, failedSourceIds, nextPageToken } =
    await mergePaginatedSources({
      sources: accounts,
      cursor,
      limit,
      concurrency: ACCOUNT_CONCURRENCY,
      compare: (left, right) =>
        getThreadTimestamp(right) - getThreadTimestamp(left),
      getItemId: (thread: CombinedListThread) => thread.id,
      loadPage: async ({ source: account, pageToken }) => {
        const page = await loadPage({ account, pageToken });
        return {
          items: page.threads.map((thread) => ({
            ...thread,
            account: {
              id: account.id,
              email: account.email,
              name: account.name,
              image: account.image,
            },
          })),
          nextPageToken: page.nextPageToken,
          meta: page.labels,
        };
      },
      onSourceError: ({ source: account, error }) =>
        logger.warn("Failed to load combined mailbox account", {
          error,
          emailAccountId: account.id,
        }),
    });

  const labelsByAccount: Record<string, EmailLabels> = {};
  for (const [accountId, labels] of Object.entries(metaBySourceId)) {
    labelsByAccount[accountId] = Object.fromEntries(
      labels.map((label) => [label.id, label]),
    );
  }

  return {
    threads: items,
    labelsByAccount,
    nextPageToken,
    failedAccountIds: failedSourceIds,
  };
}
