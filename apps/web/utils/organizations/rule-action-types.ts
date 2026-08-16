import { ActionType } from "@/generated/prisma/enums";
import { env } from "@/env";

export const ORGANIZATION_RULE_ACTION_DISABLED_MESSAGE =
  "This action is disabled in this deployment.";

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
  ActionType.DELETE,
] as const;

export function getAvailableOrganizationRuleActionTypes() {
  return ORGANIZATION_RULE_ACTION_TYPES.filter(
    isOrganizationRuleActionTypeAvailable,
  );
}

export function isOrganizationRuleActionTypeAvailable(type: ActionType) {
  if (type === ActionType.DRAFT_EMAIL) {
    return !env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED;
  }

  if (
    type === ActionType.REPLY ||
    type === ActionType.FORWARD ||
    type === ActionType.SEND_EMAIL
  ) {
    return env.NEXT_PUBLIC_EMAIL_SEND_ENABLED !== false;
  }

  if (type === ActionType.CALL_WEBHOOK) {
    return env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED !== false;
  }

  if (type === ActionType.DELETE) {
    return env.NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED === true;
  }

  return true;
}
