import { z } from "zod";
import { env } from "@/env";
import { getInternalApiHeaders, getInternalApiUrl } from "@/utils/internal-api";
import { runWithBoundedConcurrency } from "@/utils/async";
import { filterMatchType } from "@/utils/actions/mail-filter.validation";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { suppressLabelLearning } from "@/utils/redis/label-learning-suppression";

const BACKFILL_MAX_MESSAGES = 500;
const BACKFILL_CONCURRENCY = 3;

export const applyFilterBodySchema = z.object({
  emailAccountId: z.string(),
  provider: z.string(),
  matchType: filterMatchType,
  value: z.string(),
  labelId: z.string().nullable(),
  labelName: z.string(),
  skipInbox: z.boolean(),
  // The threads the filter was created from — always moved
  threadIds: z.array(z.string()).max(100),
  // Also move all existing matching mail, wherever it sits
  applyToExisting: z.boolean(),
});
export type ApplyFilterBody = z.infer<typeof applyFilterBodySchema>;

// Hands the (potentially long) move work to the internal apply-filter API
// route so it runs under that route's own time budget with normal request
// logging, instead of inside the page function that created the filter.
// Returns false when the work wasn't handed off and must run inline.
export async function queueApplyFilter(
  body: ApplyFilterBody,
  logger: Logger,
): Promise<boolean> {
  if (!env.INTERNAL_API_KEY) return false;
  try {
    const response = await fetch(
      `${getInternalApiUrl()}/api/mail/apply-filter`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
      },
    );
    if (!response.ok) {
      logger.error("Filter apply API request failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Error queueing filter apply", { error });
    return false;
  }
}

// The actual move work, shared by the internal route and the inline
// fallback: first the threads the user acted on, then the search backfill.
export async function runApplyFilter({
  emailProvider,
  ownerEmail,
  body,
  logger,
}: {
  emailProvider: EmailProvider;
  ownerEmail: string;
  body: ApplyFilterBody;
  logger: Logger;
}) {
  const { matchType, value, labelId, labelName, skipInbox } = body;

  if (body.threadIds.length) {
    await applyFilterToThreads({
      emailProvider,
      emailAccountId: body.emailAccountId,
      ownerEmail,
      threadIds: body.threadIds,
      labelId,
      labelName,
      skipInbox,
      logger,
    });
  }

  if (body.applyToExisting) {
    await applyFilterToExistingMail({
      emailProvider,
      emailAccountId: body.emailAccountId,
      ownerEmail,
      matchType,
      value,
      labelId,
      labelName,
      skipInbox,
      logger,
    });
  }
}

export function splitPatterns(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Moves matching mail into the filter's folder — wherever it currently
// sits, not just the inbox: mail already filed under another folder gets
// that label replaced (this is what "apply to past matches" means when the
// old rule filed things wrong). Bounded: a few pages, a few threads at a
// time.
async function applyFilterToExistingMail({
  emailProvider,
  emailAccountId,
  ownerEmail,
  matchType,
  value,
  labelId,
  labelName,
  skipInbox,
  logger,
}: {
  emailProvider: EmailProvider;
  emailAccountId: string;
  ownerEmail: string;
  matchType: z.infer<typeof filterMatchType>;
  value: string;
  labelId: string | null;
  labelName: string;
  skipInbox: boolean;
  logger: Logger;
}) {
  const parts = splitPatterns(value);
  const query =
    matchType === "sender"
      ? parts.length > 1
        ? `from:(${parts.join(" OR ")})`
        : `from:${parts[0]}`
      : matchType === "domain"
        ? parts.length > 1
          ? `from:(${parts.map((part) => part.replace(/^@/, "")).join(" OR ")})`
          : `from:${parts[0]?.replace(/^@/, "")}`
        : `subject:"${value.replace(/"/g, "")}"`;

  logger.info("Filter backfill searching", { query });

  const targetLabelId = await resolveTargetLabelId({
    emailProvider,
    labelId,
    labelName,
    logger,
  });
  if (!targetLabelId) return;

  const userLabelIds = await getUserLabelIds(emailProvider);

  const threadLabelIds = new Map<string, Set<string>>();
  const threadMessageIds = new Map<string, string[]>();
  let fetched = 0;
  let pageToken: string | undefined;
  while (fetched < BACKFILL_MAX_MESSAGES) {
    const { messages, nextPageToken } =
      await emailProvider.getMessagesWithPagination({
        query,
        maxResults: 100,
        pageToken,
      });
    for (const message of messages) {
      fetched++;
      if (!message.threadId) continue;
      const labelSet =
        threadLabelIds.get(message.threadId) ?? new Set<string>();
      for (const id of message.labelIds ?? []) labelSet.add(id);
      threadLabelIds.set(message.threadId, labelSet);
      threadMessageIds.set(message.threadId, [
        ...(threadMessageIds.get(message.threadId) ?? []),
        message.id,
      ]);
    }
    if (!nextPageToken || !messages.length) break;
    pageToken = nextPageToken;
  }

  logger.info("Filter backfill matched", {
    messages: fetched,
    threads: threadLabelIds.size,
  });

  const failed = await moveThreadsToFolder({
    emailProvider,
    emailAccountId,
    ownerEmail,
    targetLabelId,
    labelName,
    skipInbox,
    userLabelIds,
    threadLabelIds,
    threadMessageIds,
    logger,
  });
  logger.info("Filter backfill finished", {
    threads: threadLabelIds.size,
    failed,
  });
}

// Moves the specific threads a filter was created from: target label on,
// inbox/other folder labels off. Unlike the search-based backfill this
// works from thread ids, so it covers the exact mail the user acted on.
async function applyFilterToThreads({
  emailProvider,
  emailAccountId,
  ownerEmail,
  threadIds,
  labelId,
  labelName,
  skipInbox,
  logger,
}: {
  emailProvider: EmailProvider;
  emailAccountId: string;
  ownerEmail: string;
  threadIds: string[];
  labelId: string | null;
  labelName: string;
  skipInbox: boolean;
  logger: Logger;
}) {
  logger.info("Filter moving selected threads", { threads: threadIds.length });

  const targetLabelId = await resolveTargetLabelId({
    emailProvider,
    labelId,
    labelName,
    logger,
  });
  if (!targetLabelId) return;

  const userLabelIds = await getUserLabelIds(emailProvider);

  const threadLabelIds = new Map<string, Set<string>>();
  const threadMessageIds = new Map<string, string[]>();
  for (const threadId of threadIds) {
    try {
      const messages = await emailProvider.getThreadMessages(threadId);
      const labelSet = new Set<string>();
      for (const message of messages) {
        for (const id of message.labelIds ?? []) labelSet.add(id);
      }
      threadLabelIds.set(threadId, labelSet);
      threadMessageIds.set(
        threadId,
        messages.map((message) => message.id),
      );
    } catch (error) {
      logger.error("Filter couldn't load a selected thread", {
        threadId,
        error,
      });
    }
  }

  const failed = await moveThreadsToFolder({
    emailProvider,
    emailAccountId,
    ownerEmail,
    targetLabelId,
    labelName,
    skipInbox,
    userLabelIds,
    threadLabelIds,
    threadMessageIds,
    logger,
  });
  logger.info("Filter moved selected threads", {
    threads: threadLabelIds.size,
    failed,
  });
}

// A merged rule may carry no label id — resolve it so the move can label
async function resolveTargetLabelId({
  emailProvider,
  labelId,
  labelName,
  logger,
}: {
  emailProvider: EmailProvider;
  labelId: string | null;
  labelName: string;
  logger: Logger;
}): Promise<string | null> {
  const targetLabelId =
    labelId ?? (await emailProvider.getLabelByName(labelName))?.id ?? null;
  if (!targetLabelId) {
    logger.error("Filter couldn't resolve the folder label", { labelName });
  }
  return targetLabelId;
}

// Other user folders' labels get replaced — that's the move
async function getUserLabelIds(
  emailProvider: EmailProvider,
): Promise<Set<string>> {
  const labels = await emailProvider.getLabels();
  return new Set(
    labels.filter((label) => label.type === "user").map((label) => label.id),
  );
}

async function moveThreadsToFolder({
  emailProvider,
  emailAccountId,
  ownerEmail,
  targetLabelId,
  labelName,
  skipInbox,
  userLabelIds,
  threadLabelIds,
  threadMessageIds,
  logger,
}: {
  emailProvider: EmailProvider;
  emailAccountId: string;
  ownerEmail: string;
  targetLabelId: string;
  labelName: string;
  skipInbox: boolean;
  userLabelIds: Set<string>;
  threadLabelIds: Map<string, Set<string>>;
  threadMessageIds: Map<string, string[]>;
  logger: Logger;
}): Promise<number> {
  const results = await runWithBoundedConcurrency({
    items: [...threadLabelIds.keys()],
    concurrency: BACKFILL_CONCURRENCY,
    run: async (threadId) => {
      const present = threadLabelIds.get(threadId) ?? new Set<string>();

      if (skipInbox) {
        await emailProvider.archiveThreadWithLabel(
          threadId,
          ownerEmail,
          targetLabelId,
        );
      } else {
        const messageIds = threadMessageIds.get(threadId) ?? [];
        for (const messageId of messageIds) {
          await emailProvider.labelMessage({
            messageId,
            labelId: targetLabelId,
            labelName,
          });
        }
      }

      const stripIds = [...present].filter(
        (id) => userLabelIds.has(id) && id !== targetLabelId,
      );
      if (stripIds.length) {
        // Don't let our own strip echo back as a learned exclusion
        await suppressLabelLearning({
          emailAccountId,
          threadId,
          labelIds: stripIds,
          logger,
        });
        await emailProvider.removeThreadLabels(threadId, stripIds);
      }
    },
  });

  return results.filter((entry) => entry.result.status === "rejected").length;
}
