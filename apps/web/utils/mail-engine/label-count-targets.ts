import {
  MAX_MAILBOX_COUNT_TARGETS,
  type MailPredicate,
} from "@inboxzero/mail-core/queries";
import { withoutHiddenDrafts } from "@/utils/mail-engine/threads-query";

export const MAX_MAILBOX_COUNT_LABELS = 100;

export type MailboxCountKind = "system" | "category" | "label" | "folder";

export type MailboxCountFolder = {
  id: string;
  displayName: string;
  childFolders?: MailboxCountFolder[];
  systemType?: string | null;
};

export type MailboxLabelCount = {
  id: string;
  name: string;
  kind: MailboxCountKind;
  total: number;
  unread: number;
};

export type MailboxCountTarget = {
  id: string;
  name: string;
  kind: MailboxCountKind;
  predicate: MailPredicate;
};

export function mailboxCountTargets(input: {
  labels: Array<{ id: string; name: string }>;
  folders: MailboxCountFolder[];
  /** Drafts a pending send stands in for, hidden from Drafts like in its list. */
  hiddenDraftMessageIds?: string[];
}): MailboxCountTarget[] {
  const targets: MailboxCountTarget[] = [
    {
      id: "INBOX",
      name: "Inbox",
      kind: "system",
      predicate: { kind: "role", role: "inbox" },
    },
    {
      id: "DRAFT",
      name: "Drafts",
      kind: "system",
      predicate: withoutHiddenDrafts(
        { kind: "role", role: "draft" },
        input.hiddenDraftMessageIds ?? [],
      ),
    },
  ];

  for (const label of input.labels.slice(0, MAX_MAILBOX_COUNT_LABELS)) {
    targets.push({
      id: label.id,
      name: label.name,
      kind: "label",
      predicate: { kind: "membership", membership: "label", id: label.id },
    });
  }

  for (const folder of userFolders(input.folders)) {
    targets.push({
      id: folder.id,
      name: folder.displayName,
      kind: "folder",
      predicate: { kind: "membership", membership: "folder", id: folder.id },
    });
  }

  return targets.slice(0, MAX_MAILBOX_COUNT_TARGETS);
}

function userFolders(
  folders: MailboxCountFolder[],
): Array<{ id: string; displayName: string }> {
  return folders.flatMap((folder) => [
    ...(folder.systemType
      ? []
      : [{ id: folder.id, displayName: folder.displayName }]),
    ...userFolders(folder.childFolders ?? []),
  ]);
}
