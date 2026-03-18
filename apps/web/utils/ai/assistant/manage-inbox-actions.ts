export const manageInboxActions = [
  "archive_threads",
  "trash_threads",
  "label_threads",
  "mark_read_threads",
  "bulk_archive_senders",
  "unsubscribe_senders",
] as const;

export type ManageInboxAction = (typeof manageInboxActions)[number];

const threadIdManageInboxActions = [
  "archive_threads",
  "trash_threads",
  "label_threads",
  "mark_read_threads",
] as const satisfies readonly ManageInboxAction[];

const senderManageInboxActions = [
  "bulk_archive_senders",
  "unsubscribe_senders",
] as const satisfies readonly ManageInboxAction[];

export function isManageInboxAction(
  action: string | undefined,
): action is ManageInboxAction {
  return !!action && (manageInboxActions as readonly string[]).includes(action);
}

export function requiresThreadIds(
  action: ManageInboxAction | undefined,
): boolean {
  return (
    !!action &&
    (threadIdManageInboxActions as readonly string[]).includes(action)
  );
}

export function requiresSenderEmails(
  action: ManageInboxAction | undefined,
): boolean {
  return (
    !!action && (senderManageInboxActions as readonly string[]).includes(action)
  );
}
