import type { MetadataChange } from "@inboxzero/mail-core/commands";
import type { OperationStatus } from "@inboxzero/mail-core/operations";

const KIND_BY_CHANGE: Record<string, string> = {
  archive: "archive",
  unarchive: "unarchive",
  trash: "trash",
  restore_from_trash: "untrash",
  set_spam: "spam",
  set_read: "set_read_state",
  set_starred: "set_starred_state",
  snooze: "snooze",
  set_membership: "set_membership",
};

export function engineCommandStatus(status: string): string {
  if (status === "succeeded") return "succeeded";
  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "superseded" ||
    status === "needs_attention"
  ) {
    return "failed";
  }
  if (
    status === "executing" ||
    status === "verifying" ||
    status === "uncertain" ||
    status === "queued" ||
    status === "preparing" ||
    status === "retry_wait" ||
    status === "blocked_auth"
  ) {
    return "reconciling";
  }
  return "pending";
}

export function engineCommandKind(command: {
  kind: string;
  changeKind: string | null;
}) {
  const changeKind = command.changeKind ?? command.kind;
  if (command.kind === "send" || changeKind === "send") return "reply";
  return KIND_BY_CHANGE[changeKind] ?? changeKind;
}

export function engineCommandPayload(change: Record<string, unknown> | null) {
  if (!change) return;
  if (change.kind === "set_read") return { read: change.read };
  if (change.kind === "set_starred") return { starred: change.starred };
  if (change.kind === "snooze") {
    return {
      scheduledFor:
        typeof change.untilMs === "number"
          ? new Date(change.untilMs).toISOString()
          : undefined,
    };
  }
  if (change.kind === "set_membership") {
    return {
      membership: change.membership,
      id: change.id,
      present: change.present,
    };
  }
  return;
}

export function isReconcileStatus(status: OperationStatus) {
  return (
    status === "queued" ||
    status === "preparing" ||
    status === "executing" ||
    status === "verifying" ||
    status === "uncertain" ||
    status === "retry_wait" ||
    status === "blocked_auth"
  );
}

export function isMetadataChange(
  value: Record<string, unknown> | null,
): value is MetadataChange & Record<string, unknown> {
  return Boolean(value && typeof value.kind === "string");
}
