import type { MetadataChange } from "./commands";
import type { MessageMetadata } from "./messages";
import type { MailboxRole } from "./messages";

export type ConfirmedMessage = MessageMetadata & {
  accountId: string;
  messageId: string;
  conversationId: string;
  version: string | null;
  deleted: boolean;
};

export type PendingEffect = {
  operationId: string;
  change: MetadataChange;
  targets: Array<{ accountId: string; messageId: string }>;
};

export function applyMetadataChange(
  metadata: MessageMetadata,
  change: MetadataChange,
): MessageMetadata {
  switch (change.kind) {
    case "archive":
      return {
        ...withRoles(metadata, withoutRole(metadata.roles, "inbox")),
        snoozedUntilMs: null,
      };
    case "unarchive":
      return {
        ...withRoles(
          metadata,
          uniqueRoles([...withoutRole(metadata.roles, "trash"), "inbox"]),
        ),
        snoozedUntilMs: null,
      };
    case "set_read":
      return { ...metadata, read: change.read };
    case "set_starred":
      return { ...metadata, starred: change.starred };
    case "trash":
      return withRoles(metadata, uniqueRoles(["trash"]));
    case "restore_from_trash":
      return withRoles(
        metadata,
        uniqueRoles([...withoutRole(metadata.roles, "trash"), "inbox"]),
      );
    case "set_spam":
      return change.spam
        ? withRoles(metadata, uniqueRoles(["spam"]))
        : withRoles(
            metadata,
            uniqueRoles([...withoutRole(metadata.roles, "spam"), "inbox"]),
          );
    case "move":
      return {
        ...withRoles(metadata, withoutRole(metadata.roles, "inbox")),
        folderId: change.folderId,
      };
    case "set_membership":
      if (change.membership === "label") {
        return {
          ...metadata,
          labelIds: setMembership(metadata.labelIds, change.id, change.present),
        };
      }
      return {
        ...metadata,
        categoryIds: setMembership(
          metadata.categoryIds,
          change.id,
          change.present,
        ),
      };
    case "snooze":
      return {
        ...withRoles(metadata, withoutRole(metadata.roles, "inbox")),
        snoozedUntilMs: change.untilMs,
      };
    default: {
      const exhaustive: never = change;
      return exhaustive;
    }
  }
}

export function deriveEffectiveMessage(
  confirmed: ConfirmedMessage,
  pending: PendingEffect[],
): ConfirmedMessage & { pendingOperationIds: string[] } {
  if (confirmed.deleted) {
    return { ...confirmed, pendingOperationIds: [] };
  }
  let metadata: MessageMetadata = confirmed;
  const pendingOperationIds: string[] = [];
  for (const effect of pending) {
    if (
      !effect.targets.some(
        (target) =>
          target.accountId === confirmed.accountId &&
          target.messageId === confirmed.messageId,
      )
    ) {
      continue;
    }
    metadata = applyMetadataChange(metadata, effect.change);
    pendingOperationIds.push(effect.operationId);
  }
  return {
    ...confirmed,
    ...metadata,
    pendingOperationIds,
  };
}

export function applyMetadataPatch(
  current: MessageMetadata,
  patch: Partial<MessageMetadata>,
): MessageMetadata {
  return {
    subject: patch.subject ?? current.subject,
    preview: patch.preview ?? current.preview,
    externalUrl:
      patch.externalUrl === undefined ? current.externalUrl : patch.externalUrl,
    from: patch.from ?? current.from,
    to: patch.to ?? current.to,
    cc: patch.cc ?? current.cc,
    receivedAtMs: patch.receivedAtMs ?? current.receivedAtMs,
    read: patch.read ?? current.read,
    starred: patch.starred ?? current.starred,
    folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
    inboxSection:
      patch.inboxSection === undefined
        ? current.inboxSection
        : patch.inboxSection,
    labelIds: patch.labelIds ?? current.labelIds,
    categoryIds: patch.categoryIds ?? current.categoryIds,
    roles: patch.roles ?? current.roles,
    hasAttachments: patch.hasAttachments ?? current.hasAttachments,
    snoozedUntilMs:
      patch.snoozedUntilMs === undefined
        ? current.snoozedUntilMs
        : patch.snoozedUntilMs,
  };
}

function withRoles(
  metadata: MessageMetadata,
  roles: MailboxRole[],
): MessageMetadata {
  return { ...metadata, roles };
}

function withoutRole(roles: MailboxRole[], role: MailboxRole): MailboxRole[] {
  return roles.filter((candidate) => candidate !== role);
}

function uniqueRoles(roles: MailboxRole[]): MailboxRole[] {
  return [...new Set(roles)];
}

function setMembership(ids: string[], id: string, present: boolean): string[] {
  if (present) return [...new Set([...ids, id])];
  return ids.filter((candidate) => candidate !== id);
}
