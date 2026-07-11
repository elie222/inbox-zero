import { ActionType } from "@/generated/prisma/enums";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export const DELETE_EMAIL_ACTION_DISABLED_MESSAGE =
  "Delete email actions are disabled. Set NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED=true to enable.";

export function isDeleteEmailActionEnabled() {
  return env.NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED === true;
}

export function hasDeleteEmailAction(
  actions: ReadonlyArray<{ type: ActionType | string }>,
) {
  return actions.some((action) => action.type === ActionType.DELETE);
}

export function ensureDeleteEmailActionEnabled() {
  if (!isDeleteEmailActionEnabled()) {
    throw new SafeError(DELETE_EMAIL_ACTION_DISABLED_MESSAGE);
  }
}
