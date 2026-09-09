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
    allowExistingOnUpdate: false,
  },
  {
    type: ActionType.DELETE,
    isEnabled: isDeleteEmailActionEnabled,
    disabledMessage: DELETE_EMAIL_ACTION_DISABLED_MESSAGE,
    allowExistingOnUpdate: true,
  },
] as const;

export function addDisabledRuleActionIssue(
  actionType: ActionType,
  ctx: z.RefinementCtx,
  { allowExisting = false }: { allowExisting?: boolean } = {},
) {
  const gate = getDisabledRuleActionGate(actionType);
  if (
    !gate ||
    gate.isEnabled() ||
    (allowExisting && gate.allowExistingOnUpdate)
  ) {
    return false;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: gate.disabledMessage,
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

export function assertRuleActionUpdateEnabled(
  actions: ReadonlyArray<{ type: ActionType | string }>,
  existingActions: ReadonlyArray<{ type: ActionType | string }>,
) {
  for (const gate of RULE_ACTION_FEATURE_GATES) {
    if (gate.isEnabled()) continue;

    const requestedCount = countActionsOfType(actions, gate.type);
    if (requestedCount === 0) continue;

    const existingCount = countActionsOfType(existingActions, gate.type);
    if (gate.allowExistingOnUpdate && requestedCount <= existingCount) {
      continue;
    }

    throw new SafeError(gate.disabledMessage);
  }
}

export function getDisabledRuleActionTypesToPreserve() {
  return RULE_ACTION_FEATURE_GATES.filter(
    (gate) => !gate.isEnabled() && !gate.allowExistingOnUpdate,
  ).map((gate) => gate.type);
}

function getDisabledRuleActionMessage(actionType: ActionType | string) {
  const gate = getDisabledRuleActionGate(actionType);
  return gate && !gate.isEnabled() ? gate.disabledMessage : null;
}

function getDisabledRuleActionGate(actionType: ActionType | string) {
  return RULE_ACTION_FEATURE_GATES.find(
    (candidate) => candidate.type === actionType,
  );
}

function countActionsOfType(
  actions: ReadonlyArray<{ type: ActionType | string }>,
  actionType: ActionType,
) {
  return actions.filter((action) => action.type === actionType).length;
}
