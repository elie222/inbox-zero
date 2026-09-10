import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { mergePaginatedSources } from "@/utils/threads/merge-paginated-sources";
import { createPageBuffer } from "@/utils/redis/thread-page-buffer";
import { getThreadTimestamp } from "@/utils/threads/sort";
import type { ThreadsQuery } from "@/utils/threads/validation";

const LABEL_CONCURRENCY = 4;

/**
 * `anyLabelIds` has no provider equivalent — Gmail's `labelIds` and Graph's
 * category filter both mean "all of these". Two or more labels are served by
 * running one query per label and merging them newest-first.
 */
export async function fetchThreadsPage({
  query,
  emailProvider,
  emailAccountId,
  maxResults,
  pageToken,
  messageFormat,
}: {
  query: ThreadsQuery;
  emailProvider: EmailProvider;
  emailAccountId: string;
  maxResults: number;
  pageToken?: string;
  messageFormat: "full" | "metadata";
}): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
  if (query.q) {
    return emailProvider.searchThreads({
      query: query.q,
      maxResults,
      pageToken,
      messageFormat,
    });
  }

  if (query.anyOf?.length) {
    const merged = await mergePaginatedSources({
      sources: query.anyOf.map((condition, index) => ({
        id: String(index),
        condition,
      })),
      cursor: pageToken ?? null,
      pageBuffer: createPageBuffer<EmailThread>({
        kind: "labels",
        emailAccountId,
        messageFormat,
        maxResults,
        query,
      }),
      limit: maxResults,
      concurrency: LABEL_CONCURRENCY,
      compare: (left, right) =>
        getThreadTimestamp(right) - getThreadTimestamp(left),
      getItemId: (thread: EmailThread) => thread.id,
      dedupeItemKey: (thread) => thread.id,
      loadPage: async ({ source, pageToken }) => {
        const { anyOf: _anyOf, ...base } = query;
        const { labelId, ...condition } = source.condition;
        let requiredLabelIds = ["INBOX"];
        if (base.labelIds?.length) requiredLabelIds = base.labelIds;
        else if (base.labelId) requiredLabelIds = [base.labelId];
        const page = await emailProvider.getThreadsWithQuery({
          query: {
            ...base,
            ...condition,
            labelIds: labelId
              ? [...requiredLabelIds, labelId]
              : requiredLabelIds,
          },
          maxResults,
          pageToken,
          messageFormat,
        });
        return { items: page.threads, nextPageToken: page.nextPageToken };
      },
      onSourceError: ({ error }) => {
        throw error;
      },
    });
    return {
      threads: merged.items,
      nextPageToken: merged.nextPageToken ?? undefined,
    };
  }

  // A repeated label would run the same query twice and collide in the cursor.
  const anyLabelIds = [...new Set(query.anyLabelIds ?? [])];
  let requiredLabelIds = query.labelIds ?? [];
  if (!requiredLabelIds.length && query.labelId) {
    requiredLabelIds = [query.labelId];
  }
  const queryForLabels = (labelIds: string[]): ThreadsQuery => ({
    ...query,
    anyLabelIds: undefined,
    labelIds: [...requiredLabelIds, ...labelIds],
  });

  if (anyLabelIds.length < 2) {
    return emailProvider.getThreadsWithQuery({
      query: anyLabelIds.length ? queryForLabels(anyLabelIds) : query,
      maxResults,
      pageToken,
      messageFormat,
    });
  }

  const merged = await mergePaginatedSources({
    sources: anyLabelIds.map((labelId) => ({ id: labelId })),
    cursor: pageToken ?? null,
    pageBuffer: createPageBuffer<EmailThread>({
      kind: "labels",
      emailAccountId,
      messageFormat,
      maxResults,
      query,
    }),
    limit: maxResults,
    concurrency: LABEL_CONCURRENCY,
    compare: (left, right) =>
      getThreadTimestamp(right) - getThreadTimestamp(left),
    getItemId: (thread: EmailThread) => thread.id,
    // A thread carrying several of the labels must still show up once.
    dedupeItemKey: (thread) => thread.id,
    loadPage: async ({ source, pageToken: labelPageToken }) => {
      const page = await emailProvider.getThreadsWithQuery({
        query: queryForLabels([source.id]),
        maxResults,
        pageToken: labelPageToken,
        messageFormat,
      });
      return { items: page.threads, nextPageToken: page.nextPageToken };
    },
    // Dropping a failed label would silently narrow the split.
    onSourceError: ({ error }) => {
      throw error;
    },
  });

  return {
    threads: merged.items,
    nextPageToken: merged.nextPageToken ?? undefined,
  };
}
