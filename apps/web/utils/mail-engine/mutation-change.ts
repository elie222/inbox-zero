import type { MetadataChange } from "@inboxzero/mail-core/commands";

export type ThreadMutationPayload =
  | { kind: "archive"; labelId?: string }
  | { kind: "unarchive" }
  | { kind: "trash" }
  | { kind: "untrash" }
  | { kind: "spam" }
  | { kind: "set_read_state"; read: boolean }
  | { kind: "set_starred_state"; starred: boolean }
  | { kind: "snooze"; scheduledFor: string };

export function mutationPayloadToChange(
  payload: ThreadMutationPayload,
): MetadataChange | null {
  switch (payload.kind) {
    case "archive":
      return { kind: "archive" };
    case "unarchive":
      return { kind: "unarchive" };
    case "trash":
      return { kind: "trash" };
    case "untrash":
      return { kind: "restore_from_trash" };
    case "spam":
      return { kind: "set_spam", spam: true };
    case "set_read_state":
      return { kind: "set_read", read: payload.read };
    case "set_starred_state":
      return { kind: "set_starred", starred: payload.starred };
    case "snooze":
      return {
        kind: "snooze",
        untilMs: Date.parse(payload.scheduledFor),
      };
    default:
      return null;
  }
}
