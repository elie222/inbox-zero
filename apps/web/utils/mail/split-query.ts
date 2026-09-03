import { MailSplitKind } from "@/generated/prisma/enums";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { isOutlookInboxSection } from "@/utils/mail/outlook-inbox";

export type MailSplit = {
  id: string;
  name: string;
  kind: MailSplitKind;
  value: string | null;
};

export type PortableLabelSplit = MailSplit & { labelName: string };

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
    case MailSplitKind.LABEL:
      if (!split.value) throw new Error(`Split "${split.name}" has no label`);
      return { labelIds: [split.value, "INBOX"] };
    case MailSplitKind.CATEGORY:
      if (!split.value)
        throw new Error(`Split "${split.name}" has no category`);
      if (isOutlookInboxSection(split.value)) {
        return mailTypeToThreadsQuery(split.value);
      }
      return { labelIds: [split.value, "INBOX"] };
    case MailSplitKind.FROM:
      if (!split.value) throw new Error(`Split "${split.name}" has no sender`);
      return { type: "inbox", fromEmail: split.value };
  }
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
    if (split.kind !== MailSplitKind.LABEL || !split.value) return [];
    const labelName = labelsById[split.value]?.name.trim();
    return labelName ? [{ ...split, labelName }] : [];
  });
}
