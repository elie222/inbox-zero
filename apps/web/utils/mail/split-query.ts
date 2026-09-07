import { MailSplitKind } from "@/generated/prisma/enums";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { isOutlookInboxSection } from "@/utils/mail/outlook-inbox";

export type MailSplit = {
  id: string;
  name: string;
  kind: MailSplitKind;
  values: string[];
};

export type PortableLabelSplit = MailSplit & { labelNames: string[] };

/**
 * Every split is its own server query. Filtering a paginated list client-side would
 * only ever search the pages already loaded, which silently under-reports.
 */
export function mailSplitToThreadsQuery(split: MailSplit): ThreadsQuery {
  switch (split.kind) {
    case MailSplitKind.INBOX:
      return { type: "inbox" };
    case MailSplitKind.UNREAD:
      return { type: "inbox", isUnread: true };
    case MailSplitKind.LABEL: {
      if (!split.values.length)
        throw new Error(`Split "${split.name}" has no label`);
      if (split.values.length === 1)
        return { labelIds: [split.values[0], "INBOX"] };
      return { labelIds: ["INBOX"], anyLabelIds: split.values };
    }
    case MailSplitKind.CATEGORY: {
      const [category] = split.values;
      if (!category) throw new Error(`Split "${split.name}" has no category`);
      if (isOutlookInboxSection(category)) {
        return mailTypeToThreadsQuery(category);
      }
      return { labelIds: [category, "INBOX"] };
    }
  }
}

export function mailTypeToThreadsQuery(type: string): ThreadsQuery {
  if (isOutlookInboxSection(type)) {
    return { type: "inbox", inboxSection: type };
  }
  return { type };
}

/**
 * Splits the combined mailbox can run. It matches by label name because each
 * account has its own label ids, so a split whose labels no longer resolve is
 * dropped rather than silently run against fewer labels.
 */
export function getPortableLabelSplits(
  splits: MailSplit[],
  labelsById: Record<string, { name: string }>,
): PortableLabelSplit[] {
  return splits.flatMap((split) => {
    if (split.kind !== MailSplitKind.LABEL) return [];
    const labelNames = split.values.flatMap((labelId) => {
      const labelName = labelsById[labelId]?.name.trim();
      return labelName ? [labelName] : [];
    });
    return labelNames.length && labelNames.length === split.values.length
      ? [{ ...split, labelNames }]
      : [];
  });
}
