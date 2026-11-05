import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { GmailLabel } from "@/utils/gmail/label";
import { isOutlookInboxSection } from "@/utils/outlook/inbox-sections";
import type { MailSplit } from "@/utils/split-inbox/split-query";
import { createSplitMatcher } from "@/utils/split-inbox/thread-matches-split";
import {
  getListThreadKey,
  type ListThread,
} from "@/app/(app)/[emailAccountId]/mail/types";

export type InboxBundle = {
  id: string;
  name: string;
  /** Newest first, the order the inbox lists them in. */
  threads: ListThread[];
  expanded: boolean;
};

/** How a displayed row relates to a bundle. */
export type InboxBundleRow =
  | { kind: "collapsed"; bundle: InboxBundle }
  | { kind: "member"; bundle: InboxBundle; isFirst: boolean };

type BundleSplit = MailSplit & { bundleInInbox: boolean };

/**
 * Folds inbox threads from bundled splits into one row per split. Each bundle
 * sits where its newest thread would, so new mail in a bundle still surfaces
 * at the top and new mail outside bundles is never pushed down by them.
 */
export function bundleInboxThreads({
  threads,
  splits,
  expandedBundleIds,
  keepVisible,
  now = new Date(),
}: {
  threads: ListThread[];
  splits: BundleSplit[];
  expandedBundleIds: ReadonlySet<string>;
  /** Threads that should always stay as their own row, such as sign-in codes. */
  keepVisible: (thread: ListThread) => boolean;
  now?: Date;
}): { rows: ListThread[]; rowBundles: Map<string, InboxBundleRow> } {
  const matchable = splits
    .filter((split) => split.filters.length && isMatchableOnClient(split))
    .map((split) => ({ split, matches: createSplitMatcher(split, now) }));
  const bundled = matchable.filter(
    ({ split }) => split.bundleInInbox && isBundleEligibleSplit(split),
  );
  // A thread that also belongs to a split the user did not bundle, like To
  // Reply, needs attention, so it never hides inside a bundle.
  const protectedSplits = matchable.filter(
    ({ split }) =>
      !split.bundleInInbox &&
      split.filters.some((filter) => CONTENT_FILTER_KINDS.has(filter.kind)),
  );

  const rowBundles = new Map<string, InboxBundleRow>();
  if (!bundled.length) return { rows: threads, rowBundles };

  const bundleByThreadKey = new Map<string, InboxBundle>();
  const bundles = new Map<string, InboxBundle>();
  for (const thread of threads) {
    if (
      keepVisible(thread) ||
      isStarred(thread) ||
      protectedSplits.some(({ matches }) => matches(thread))
    )
      continue;
    const split = bundled.find(({ matches }) => matches(thread))?.split;
    if (!split) continue;
    let bundle = bundles.get(split.id);
    if (!bundle) {
      bundle = {
        id: split.id,
        name: split.name,
        threads: [],
        expanded: expandedBundleIds.has(split.id),
      };
      bundles.set(split.id, bundle);
    }
    bundle.threads.push(thread);
    bundleByThreadKey.set(getListThreadKey(thread), bundle);
  }

  const rows: ListThread[] = [];
  const placed = new Set<string>();
  for (const thread of threads) {
    const bundle = bundleByThreadKey.get(getListThreadKey(thread));
    // A lone thread gains nothing from a bundle row.
    if (!bundle || bundle.threads.length < 2) {
      rows.push(thread);
      continue;
    }
    if (placed.has(bundle.id)) continue;
    placed.add(bundle.id);

    if (!bundle.expanded) {
      rows.push(thread);
      rowBundles.set(getListThreadKey(thread), { kind: "collapsed", bundle });
      continue;
    }
    bundle.threads.forEach((member, index) => {
      rows.push(member);
      rowBundles.set(getListThreadKey(member), {
        kind: "member",
        bundle,
        isFirst: index === 0,
      });
    });
  }

  return { rows, rowBundles };
}

const CONTENT_FILTER_KINDS = new Set<MailSplitFilterKind>([
  MailSplitFilterKind.LABEL,
  MailSplitFilterKind.CATEGORY,
  MailSplitFilterKind.FROM,
]);

/**
 * Splits defined by what mail is (a label, category or sender) can bundle.
 * State-only splits like Unread or Starred would sweep up everything.
 */
export function isBundleEligibleSplit(split: MailSplit) {
  const isContent = (filter: MailSplit["filters"][number]) =>
    CONTENT_FILTER_KINDS.has(filter.kind);
  // With "match any", one state condition like Unread would admit all mail.
  const narrowsToContent = split.matchAll
    ? split.filters.some(isContent)
    : split.filters.length > 0 && split.filters.every(isContent);
  return narrowsToContent && isMatchableOnClient(split);
}

/** Outlook's Focused/Other sections aren't visible on a loaded thread. */
function isMatchableOnClient(split: MailSplit) {
  return split.filters.every(
    (filter) =>
      filter.kind !== MailSplitFilterKind.CATEGORY ||
      !isOutlookInboxSection(filter.value ?? ""),
  );
}

function isStarred(thread: ListThread) {
  return thread.messages.some((message) =>
    message.labelIds?.includes(GmailLabel.STARRED),
  );
}
