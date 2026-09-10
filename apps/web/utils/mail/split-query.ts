import { MailSplitFilterKind } from "@/generated/prisma/enums";
import type {
  ThreadsQuery,
  ThreadsQueryLeaf,
} from "@/utils/threads/validation";
import { isOutlookInboxSection } from "@/utils/mail/outlook-inbox";

export type MailSplitFilter = {
  kind: MailSplitFilterKind;
  value: string | null;
};

export type MailSplit = {
  id: string;
  name: string;
  /** False means "show mail matching any of these conditions". */
  matchAll: boolean;
  filters: MailSplitFilter[];
};

export type PortableLabelSplit = MailSplit & { labelNames: string[] };

/** Tokens the "Older than" condition offers, and how far back each one reaches. */
const OLDER_THAN_DAYS: Record<string, number> = {
  "3d": 3,
  "1w": 7,
  "1m": 30,
};

export const OLDER_THAN_OPTIONS = [
  { value: "3d", name: "3 days" },
  { value: "1w", name: "a week" },
  { value: "1m", name: "a month" },
];

/**
 * Every split is its own server query. Filtering a paginated list client-side would
 * only ever search the pages already loaded, which silently under-reports.
 *
 * `now` is injected so the "older than" window is testable.
 */
export function mailSplitToThreadsQuery(
  split: MailSplit,
  now: Date = new Date(),
): ThreadsQuery {
  // A split with no conditions is the plain inbox — that's what "All" is.
  if (!split.filters.length) return { type: "inbox" };

  return split.matchAll ? matchAllQuery(split, now) : matchAnyQuery(split, now);
}

export function mailTypeToThreadsQuery(type: string): ThreadsQuery {
  if (isOutlookInboxSection(type)) {
    return { type: "inbox", inboxSection: type };
  }
  return { type };
}

export function getPortableLabelSplits(
  splits: MailSplit[],
  labelsById: Record<string, { name: string }>,
): PortableLabelSplit[] {
  return splits.flatMap((split) => {
    const labelFilters = split.filters.filter(
      (filter) => filter.kind === MailSplitFilterKind.LABEL,
    );
    if (
      !labelFilters.length ||
      labelFilters.length !== split.filters.length ||
      (split.matchAll && labelFilters.length > 1)
    )
      return [];

    const labelNames = labelFilters.map(
      (filter) => labelsById[filter.value ?? ""]?.name.trim() ?? "",
    );
    // A split that leans on a label the account no longer has can't be
    // reproduced elsewhere, so it's dropped rather than silently widened.
    if (labelNames.some((name) => !name)) return [];

    return [{ ...split, labelNames }];
  });
}

/** Everything ANDs into a single provider query. */
function matchAllQuery(split: MailSplit, now: Date): ThreadsQuery {
  const labelIds = ["INBOX"];
  const query: ThreadsQuery = {};

  for (const filter of split.filters) {
    switch (filter.kind) {
      case MailSplitFilterKind.UNREAD:
        query.isUnread = true;
        break;
      case MailSplitFilterKind.STARRED:
        labelIds.push("STARRED");
        break;
      case MailSplitFilterKind.LABEL:
        labelIds.push(requireValue(filter, split, "label"));
        break;
      case MailSplitFilterKind.CATEGORY: {
        const category = requireValue(filter, split, "category");
        if (isOutlookInboxSection(category)) query.inboxSection = category;
        else labelIds.push(category);
        break;
      }
      case MailSplitFilterKind.FROM:
        query.fromEmail = requireValue(filter, split, "sender");
        break;
      case MailSplitFilterKind.OLDER_THAN: {
        const before = olderThanDate(
          requireValue(filter, split, "age"),
          split,
          now,
        );
        if (!query.before || before < query.before) query.before = before;
        break;
      }
    }
  }

  // `inboxSection` only narrows Outlook's inbox when nothing else pins the
  // folder, so it carries the inbox scope itself rather than a label id.
  if (query.inboxSection && labelIds.length === 1)
    return { ...query, type: "inbox" };
  return { ...query, labelIds };
}

/**
 * "Match any" is a disjunction, which a single flat query can't express, so each
 * condition becomes its own leaf and the provider ORs them inside the inbox.
 */
function matchAnyQuery(split: MailSplit, now: Date): ThreadsQuery {
  const anyOf = split.filters.map<ThreadsQueryLeaf>((filter) => {
    switch (filter.kind) {
      case MailSplitFilterKind.UNREAD:
        return { isUnread: true };
      case MailSplitFilterKind.STARRED:
        return { labelId: "STARRED" };
      case MailSplitFilterKind.LABEL:
        return { labelId: requireValue(filter, split, "label") };
      case MailSplitFilterKind.CATEGORY: {
        const category = requireValue(filter, split, "category");
        return isOutlookInboxSection(category)
          ? { inboxSection: category }
          : { labelId: category };
      }
      case MailSplitFilterKind.FROM:
        return { fromEmail: requireValue(filter, split, "sender") };
      case MailSplitFilterKind.OLDER_THAN:
        return {
          before: olderThanDate(requireValue(filter, split, "age"), split, now),
        };
    }
  });

  return { labelIds: ["INBOX"], anyOf };
}

function requireValue(
  filter: MailSplitFilter,
  split: MailSplit,
  what: string,
): string {
  if (!filter.value) throw new Error(`Split "${split.name}" has no ${what}`);
  return filter.value;
}

function olderThanDate(token: string, split: MailSplit, now: Date): Date {
  const days = OLDER_THAN_DAYS[token];
  if (!days) throw new Error(`Split "${split.name}" has an unknown age`);
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function labelIdsToThreadsQuery(labelIds: string[]): ThreadsQuery {
  if (labelIds.length === 1) return { labelIds: [labelIds[0], "INBOX"] };
  return { labelIds: ["INBOX"], anyLabelIds: labelIds };
}
