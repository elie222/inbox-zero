import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import type { ActionContext, StructuredAction } from "@/utils/ai/agent/types";
import { normalizeAgentActionType } from "@/utils/ai/agent/types";
import { validateConditions } from "@/utils/ai/agent/validation/schemas";
import {
  evaluateCondition,
  type ConditionResult,
} from "@/utils/ai/agent/validation/conditions";
import type { ParsedMessage } from "@/utils/types";

export type ValidationResult = {
  allowed: boolean;
  reason?: string;
  conditionsChecked: ConditionResult[];
};

export async function validateAction({
  action,
  context,
  logger,
}: {
  action: StructuredAction;
  context: ActionContext;
  logger: Logger;
}): Promise<ValidationResult> {
  const conditionsChecked: ConditionResult[] = [];
  const log = logger.with({ module: "agent-validation" });

  const normalizedActionType = normalizeAgentActionType(action.type);

  const allowedAction = await getAllowedAction({
    emailAccountId: context.emailAccountId,
    actionType: normalizedActionType,
    resourceType: context.resourceType,
  });

  if (!allowedAction?.enabled) {
    return {
      allowed: false,
      reason: `Action type "${action.type}" not enabled`,
      conditionsChecked,
    };
  }

  let emailProvider = null;
  let message: ParsedMessage | null = null;

  if (allowedAction.conditions) {
    let conditions: ReturnType<typeof validateConditions>;
    try {
      conditions = validateConditions(allowedAction.conditions);
    } catch (error) {
      log.error("Invalid action conditions stored", { error });
      return {
        allowed: false,
        reason: "Action conditions are invalid",
        conditionsChecked,
      };
    }

    emailProvider = await createEmailProvider({
      emailAccountId: context.emailAccountId,
      provider: context.provider,
      logger: log,
    });

    message = context.emailId
      ? await emailProvider.getMessage(context.emailId)
      : null;

    for (const condition of conditions) {
      const result = await evaluateCondition({
        condition,
        context,
        logger: log,
        emailProvider,
        message,
      });
      conditionsChecked.push(result);
      if (!result.passed) {
        return {
          allowed: false,
          reason: result.reason,
          conditionsChecked,
        };
      }
    }
  }

  if (normalizedActionType === "classify" || normalizedActionType === "move") {
    // biome-ignore lint/suspicious/noExplicitAny: StructuredAction union can't narrow via derived value
    const a = action as any;
    if (!a.targetExternalId && !a.targetName) {
      return {
        allowed: false,
        reason: "Target is required for this action",
        conditionsChecked,
      };
    }

    const targetFilters = [
      a.targetExternalId ? { externalId: a.targetExternalId } : undefined,
      a.targetName ? { name: a.targetName } : undefined,
    ].filter(Boolean) as unknown as Array<Record<string, string>>;

    const target = await prisma.allowedActionOption.findFirst({
      where: {
        emailAccountId: context.emailAccountId,
        actionType: normalizedActionType,
        provider: context.provider,
        OR: [{ resourceType: context.resourceType }, { resourceType: null }],
        AND: [
          {
            OR: targetFilters,
          },
        ],
      },
      include: { targetGroup: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    if (!target) {
      return {
        allowed: false,
        reason: "Target not in allow list",
        conditionsChecked,
      };
    }

    if (target.targetGroup?.cardinality === "SINGLE") {
      const targetKey = target.externalId ?? target.name;

      if (!emailProvider) {
        emailProvider = await createEmailProvider({
          emailAccountId: context.emailAccountId,
          provider: context.provider,
          logger: log,
        });
      }

      if (!message && context.emailId) {
        message = await emailProvider.getMessage(context.emailId);
      }

      const currentGroupValue = await getProviderTargetGroupValue({
        emailAccountId: context.emailAccountId,
        targetGroupId: target.targetGroupId,
        message,
      });

      if (currentGroupValue === targetKey) {
        return {
          allowed: false,
          reason: "Resource already has this target group value",
          conditionsChecked,
        };
      }
    }
  }

  return { allowed: true, conditionsChecked };
}

async function getAllowedAction({
  emailAccountId,
  actionType,
  resourceType,
}: {
  emailAccountId: string;
  actionType: string;
  resourceType: string;
}) {
  const actions = await prisma.allowedAction.findMany({
    where: {
      emailAccountId,
      actionType,
      OR: [{ resourceType }, { resourceType: null }],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return (
    actions.find((action) => action.resourceType === resourceType) ??
    actions.find((action) => action.resourceType === null)
  );
}

async function getProviderTargetGroupValue({
  emailAccountId,
  targetGroupId,
  message,
}: {
  emailAccountId: string;
  targetGroupId: string | null;
  message: ParsedMessage | null;
}): Promise<string | null> {
  if (!targetGroupId || !message) return null;

  const options = await prisma.allowedActionOption.findMany({
    where: { emailAccountId, targetGroupId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const currentLabels = message.labelIds ?? [];

  for (const option of options) {
    const key = option.externalId ?? option.name;
    if (currentLabels.includes(key)) {
      return key;
    }
  }

  return null;
}
