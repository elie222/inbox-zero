import { internalDateToDate } from "@/utils/date";
import {
  matchesRecipientFilter,
  matchesSenderFilter,
} from "@/utils/split-inbox/sender-filter";
import type { ParsedMessage } from "@/utils/types";
import {
  mailSplitToThreadsQuery,
  type MailSplit,
} from "@/utils/split-inbox/split-query";
import type {
  ThreadsQuery,
  ThreadsQueryLeaf,
} from "@/utils/threads/validation";

type SplitMessage = Pick<
  ParsedMessage,
  "labelIds" | "headers" | "internalDate"
>;

type MatchableSplit = Pick<MailSplit, "matchAll" | "filters">;

export function createOtherSplitFilter(
  splits: NonNullable<ThreadsQuery["excludeSplits"]>,
  now: Date = new Date(),
) {
  const matchers = splits
    .filter((split) => split.filters.length)
    .map((split) =>
      createSplitMatcher(
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
  return (thread: { messages: SplitMessage[] }): boolean =>
    !matchers.some((matches) => matches(thread));
}

/** Matches a split against a loaded thread, mirroring the provider query. */
export function createSplitMatcher(
  split: MatchableSplit,
  now: Date = new Date(),
) {
  const query = mailSplitToThreadsQuery(split, now);
  // Gmail matches all AND conditions on the same message. Inspect the full
  // conversation so mixed-label threads cannot also leak into Other.
  return (thread: { messages: SplitMessage[] }): boolean =>
    thread.messages.some(
      (message) =>
        matchesMessage(message, query) &&
        (!query.anyOf?.length ||
          query.anyOf.some((condition) => matchesMessage(message, condition))),
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
    !matchesSenderFilter(message.headers.from, query.fromEmail)
  )
    return false;
  if (query.toEmail && !matchesRecipientFilter(message.headers, query.toEmail))
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
