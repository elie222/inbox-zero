import { z } from "zod";
import { ActionType } from "@/generated/prisma/enums";
import {
  DELETE_EMAIL_ACTION_DISABLED_MESSAGE,
  isDeleteEmailActionEnabled,
} from "@/utils/delete-email-action";
import { SafeError } from "@/utils/error";
import {
  isWebhookActionEnabled,
  WEBHOOK_ACTION_DISABLED_MESSAGE,
} from "@/utils/webhook-action";

const RULE_ACTION_FEATURE_GATES = [
  {
    type: ActionType.CALL_WEBHOOK,
    isEnabled: isWebhookActionEnabled,
    disabledMessage: WEBHOOK_ACTION_DISABLED_MESSAGE,
  },
  {
    type: ActionType.DELETE,
    isEnabled: isDeleteEmailActionEnabled,
    disabledMessage: DELETE_EMAIL_ACTION_DISABLED_MESSAGE,
  },
] as const;

export function addDisabledRuleActionIssue(
  actionType: ActionType,
  ctx: z.RefinementCtx,
) {
  const disabledMessage = getDisabledRuleActionMessage(actionType);
  if (!disabledMessage) return false;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: disabledMessage,
    path: ["type"],
  });
  return true;
}

export function assertRuleActionsEnabled(
  actions: ReadonlyArray<{ type: ActionType | string }>,
) {
  for (const action of actions) {
    const disabledMessage = getDisabledRuleActionMessage(action.type);
    if (disabledMessage) throw new SafeError(disabledMessage);
  }
}

export function getDisabledRuleActionTypes() {
  return RULE_ACTION_FEATURE_GATES.filter((gate) => !gate.isEnabled()).map(
    (gate) => gate.type,
  );
}

function getDisabledRuleActionMessage(actionType: ActionType | string) {
  const gate = RULE_ACTION_FEATURE_GATES.find(
    (candidate) => candidate.type === actionType,
  );
  return gate && !gate.isEnabled() ? gate.disabledMessage : null;
}
