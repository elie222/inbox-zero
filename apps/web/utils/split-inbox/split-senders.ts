import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { internalDateToDate } from "@/utils/date";
import { canonicalizeEmailAddress, isValidEmail } from "@/utils/email";
import { matchesSenderFilter } from "@/utils/split-inbox/sender-filter";
import {
  MAX_SPLIT_FILTERS,
  type MailSplitFilterDraft,
} from "@/utils/split-inbox/split-filters";

export type SenderThread = {
  headers: { from: string };
  internalDate?: string | null;
}[];

type SplitConditions = {
  matchAll: boolean;
  filters: { kind: MailSplitFilterKind; value: string | null }[];
};

/**
 * Adding a sender means "also show mail from them". That holds for a split that
 * matches any condition, has a single condition, or is defined by senders alone;
 * adding a sender to "label X and from A" would narrow it instead. A split with
 * no conditions is the plain inbox, which already holds every sender.
 */
export function canAddSendersToSplit(split: SplitConditions) {
  if (!split.filters.length) return false;
  return (
    !split.matchAll ||
    split.filters.length === 1 ||
    split.filters.every((filter) => filter.kind === MailSplitFilterKind.FROM)
  );
}

export function addSendersToSplitFilters(
  split: SplitConditions,
  senders: string[],
):
  | { status: "incompatible" }
  | { status: "limit" }
  | {
      status: "ok";
      added: string[];
      matchAll: boolean;
      filters: MailSplitFilterDraft[];
    } {
  if (!canAddSendersToSplit(split)) return { status: "incompatible" };

  const covered = split.filters
    .filter((filter) => filter.kind === MailSplitFilterKind.FROM)
    .map((filter) => filter.value ?? "");
  const added: string[] = [];
  for (const sender of senders) {
    const address = canonicalizeEmailAddress(sender);
    if (!address) continue;
    if ([...covered, ...added].some((f) => matchesSenderFilter(address, f)))
      continue;
    added.push(address);
  }

  const filters = [
    ...split.filters,
    ...added.map((value) => ({ kind: MailSplitFilterKind.FROM, value })),
  ];
  if (filters.length > MAX_SPLIT_FILTERS) return { status: "limit" };

  return {
    status: "ok",
    added,
    // Several senders under "match all" would match nothing.
    matchAll: split.matchAll && filters.length <= 1,
    filters,
  };
}

/**
 * The other party on each thread: its latest message not sent from one of the
 * user's own addresses. List messages carry the conversation's labels rather
 * than their own, so a SENT label can't tell the user's messages apart.
 */
export function getThreadSenders(
  threads: SenderThread[],
  ownAddresses: string[],
) {
  const own = new Set(ownAddresses.map(canonicalizeEmailAddress));
  const senders = new Set<string>();
  for (const messages of threads) {
    // Providers return thread messages in their own order, so go by date and
    // fall back to position when dates tie or any is missing.
    const candidates = messages
      .map((message, index) => ({
        address: canonicalizeEmailAddress(message.headers.from),
        time: internalDateToDate(message.internalDate, {
          fallbackToNow: false,
        }).getTime(),
        index,
      }))
      // The action rejects the whole request over one malformed address.
      .filter(
        ({ address }) =>
          address &&
          !own.has(address) &&
          address.length <= 320 &&
          isValidEmail(address),
      );
    const allDated = candidates.every(({ time }) => Number.isFinite(time));
    const address = candidates
      .sort((a, b) => (allDated ? a.time - b.time : 0) || a.index - b.index)
      .at(-1)?.address;
    if (address) senders.add(address);
  }
  return [...senders];
}
