import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { threadsQueryToPredicate } from "@/utils/mail-engine/threads-query";
import {
  OTHER_SPLIT_ID,
  mailSplitToThreadsQuery,
  otherMailSplitQuery,
  type MailSplit,
} from "@/utils/mail/split-query";

/**
 * Counts use the same predicate as the thread list. A client-side count of the
 * loaded page would under-report every split that has more mail than one page.
 */
export function splitCountTargets({
  splits,
  now = new Date(),
  overrides,
}: {
  splits: MailSplit[];
  now?: Date;
  /** `null` means the split's predicate is not ready, so it is left uncounted. */
  overrides?: ReadonlyMap<string, MailPredicate | null>;
}): Array<{ id: string; predicate: MailPredicate }> {
  const targets: Array<{ id: string; predicate: MailPredicate }> = [];

  for (const split of splits) {
    if (overrides?.has(split.id)) {
      const override = overrides.get(split.id);
      if (override) targets.push({ id: split.id, predicate: override });
      continue;
    }

    try {
      targets.push({
        id: split.id,
        predicate: predicateForSplit(split, splits, now),
      });
    } catch {
      // The list query throws for a split that is missing a required value.
      // Skip it here so one incomplete split does not blank every other count.
    }
  }

  return targets;
}

function predicateForSplit(
  split: MailSplit,
  splits: MailSplit[],
  now: Date,
): MailPredicate {
  const query =
    split.id === OTHER_SPLIT_ID
      ? otherMailSplitQuery(splits)
      : mailSplitToThreadsQuery(split, now);
  return threadsQueryToPredicate(query);
}
