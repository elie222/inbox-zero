import { ActionType } from "@/generated/prisma/enums";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export const WEBHOOK_ACTION_DISABLED_MESSAGE =
  "Webhook actions are disabled. Set NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED=true to enable.";

export function isWebhookActionEnabled() {
  return env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED !== false;
}

export function hasWebhookAction(
  actions: ReadonlyArray<{ type: ActionType | string }>,
) {
  return actions.some((action) => action.type === ActionType.CALL_WEBHOOK);
}

export function ensureWebhookActionEnabled() {
  if (!isWebhookActionEnabled()) {
    throw new SafeError(WEBHOOK_ACTION_DISABLED_MESSAGE);
  }
}
