import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { canonicalizeEmailAddress } from "@/utils/email";
import { matchesSenderFilter } from "@/utils/split-inbox/sender-filter";
import {
  MAX_SPLIT_FILTERS,
  type MailSplitFilterDraft,
} from "@/utils/split-inbox/split-filters";

type SplitConditions = {
  matchAll: boolean;
  filters: { kind: MailSplitFilterKind; value: string | null }[];
};

/**
 * Adding a sender means "also show mail from them". That only holds for a split
 * that matches any condition, or one defined by senders alone; adding a sender to
 * "label X and from A" would narrow it instead. A split with no conditions is the
 * plain inbox, which already holds every sender.
 */
export function canAddSendersToSplit(split: SplitConditions) {
  if (!split.filters.length) return false;
  return (
    !split.matchAll ||
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
