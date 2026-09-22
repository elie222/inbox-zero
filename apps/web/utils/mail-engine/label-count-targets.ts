import type {
  ConversationQuery,
  MailPredicate,
} from "@inboxzero/mail-core/queries";

export const MAILBOX_COUNT_PAGE_SIZE = 1;
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
  query: ConversationQuery;
};

export function mailboxCountTargets(input: {
  accountId: string;
  labels: Array<{ id: string; name: string }>;
  folders: MailboxCountFolder[];
}): MailboxCountTarget[] {
  const accountIds = [input.accountId];
  const targets: MailboxCountTarget[] = [
    countTarget({
      id: "INBOX",
      name: "Inbox",
      kind: "system",
      accountIds,
      predicate: { kind: "role", role: "inbox" },
    }),
    countTarget({
      id: "DRAFT",
      name: "Drafts",
      kind: "system",
      accountIds,
      predicate: { kind: "role", role: "draft" },
    }),
  ];

  for (const label of input.labels.slice(0, MAX_MAILBOX_COUNT_LABELS)) {
    targets.push(
      countTarget({
        id: label.id,
        name: label.name,
        kind: "label",
        accountIds,
        predicate: {
          kind: "membership",
          membership: "label",
          id: label.id,
        },
      }),
    );
  }

  for (const folder of userFolders(input.folders)) {
    targets.push(
      countTarget({
        id: folder.id,
        name: folder.displayName,
        kind: "folder",
        accountIds,
        predicate: {
          kind: "membership",
          membership: "folder",
          id: folder.id,
        },
      }),
    );
  }

  return targets;
}

export function inboxUnreadQuery(accountIds: string[]): ConversationQuery {
  return {
    accountIds,
    predicate: { kind: "role", role: "inbox" },
    order: "newest_first",
    pageSize: MAILBOX_COUNT_PAGE_SIZE,
    after: null,
  };
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

function countTarget(input: {
  id: string;
  name: string;
  kind: MailboxCountKind;
  accountIds: string[];
  predicate: MailPredicate;
}): MailboxCountTarget {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    query: {
      accountIds: input.accountIds,
      predicate: input.predicate,
      order: "newest_first",
      pageSize: MAILBOX_COUNT_PAGE_SIZE,
      after: null,
    },
  };
}
