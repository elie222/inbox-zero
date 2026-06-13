import { ActionType } from "@/generated/prisma/enums";

// Action types an organization rule may use. Messaging-channel actions are
// excluded (each member needs their own channel) and NOTIFY_SENDER is
// cold-email-only. The validation schema and the admin editor both derive from
// this list so they can't drift. Kept zod-free so the client editor can import
// it without pulling the validation module into the bundle.
export const ORGANIZATION_RULE_ACTION_TYPES = [
  ActionType.LABEL,
  ActionType.ARCHIVE,
  ActionType.MARK_READ,
  ActionType.MARK_SPAM,
  ActionType.STAR,
  ActionType.MOVE_FOLDER,
  ActionType.FORWARD,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.DRAFT_EMAIL,
  ActionType.CALL_WEBHOOK,
  ActionType.DIGEST,
] as const;
