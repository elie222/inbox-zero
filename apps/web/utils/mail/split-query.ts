import { MailSplitKind } from "@/generated/prisma/enums";
import type { ThreadsQuery } from "@/utils/threads/validation";

export type MailSplit = {
  id: string;
  name: string;
  kind: MailSplitKind;
  value: string | null;
};

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
      return { labelId: split.value };
    case MailSplitKind.CATEGORY:
      if (!split.value)
        throw new Error(`Split "${split.name}" has no category`);
      return { type: split.value };
  }
}
