import { internalDateToDate } from "@/utils/date";
import { isSameEmailAddress } from "@/utils/email";
import type { ParsedMessage } from "@/utils/types";
import { mailSplitToThreadsQuery } from "@/utils/mail/split-query";
import type {
  ThreadsQuery,
  ThreadsQueryLeaf,
} from "@/utils/threads/validation";

type SplitMessage = Pick<
  ParsedMessage,
  "labelIds" | "headers" | "internalDate"
>;

export function createOtherSplitFilter(
  splits: NonNullable<ThreadsQuery["excludeSplits"]>,
  now: Date = new Date(),
) {
  const queries = splits
    .filter((split) => split.filters.length)
    .map((split) =>
      mailSplitToThreadsQuery(
        {
          ...split,
          filters: split.filters.map((filter) => ({
            ...filter,
            value: filter.value ?? null,
          })),
        },
        now,
      ),
    );
  // Gmail matches all AND conditions on the same message. Inspect the full
  // conversation so mixed-label threads cannot also leak into Other.
  return (thread: { messages: SplitMessage[] }): boolean =>
    !queries.some((query) =>
      thread.messages.some(
        (message) =>
          matchesMessage(message, query) &&
          (!query.anyOf?.length ||
            query.anyOf.some((condition) =>
              matchesMessage(message, condition),
            )),
      ),
    );
}

function matchesMessage(
  message: SplitMessage,
  query: ThreadsQuery | ThreadsQueryLeaf,
): boolean {
  const labels = message.labelIds ?? [];
  if (
    "labelIds" in query &&
    query.labelIds?.some((label) => !labels.includes(label))
  )
    return false;
  if (query.labelId && !labels.includes(query.labelId)) return false;
  if (query.isUnread && !labels.includes("UNREAD")) return false;
  if (
    query.fromEmail &&
    !isSameEmailAddress(message.headers.from, query.fromEmail)
  )
    return false;
  if (query.before) {
    const timestamp = internalDateToDate(message.internalDate, {
      fallbackToNow: false,
    }).getTime();
    if (
      !Number.isFinite(timestamp) ||
      timestamp >= Math.floor(query.before.getTime() / 1000) * 1000
    )
      return false;
  }
  return true;
}
