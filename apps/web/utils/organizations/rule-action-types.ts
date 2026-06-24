import { ActionType } from "@/generated/prisma/enums";

// Keep zod-free because client components import this list.
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
