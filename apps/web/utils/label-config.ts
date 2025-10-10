import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { ActionType } from "@prisma/client";
import { getRuleLabel } from "@/utils/rule/consts";

const logger = createScopedLogger("label-config");

type SystemLabelType =
  | "TO_REPLY"
  | "AWAITING_REPLY"
  | "FYI"
  | "ACTIONED"
  | "COLD_EMAIL";

export async function getOrCreateSystemLabelId(options: {
  emailAccountId: string;
  type: SystemLabelType;
  provider: EmailProvider;
}): Promise<string | null> {
  const { emailAccountId, type, provider } = options;

  const existingId = await getSystemLabelId({ emailAccountId, type });
  if (existingId) {
    return existingId;
  }

  const labelName = getRuleLabel(type);

  try {
    let label = await provider.getLabelByName(labelName);

    if (!label) {
      logger.info("Creating system label", { type, name: labelName });
      label = await provider.createLabel(labelName);
    }

    await updateSystemLabelId({
      emailAccountId,
      type,
      labelId: label.id,
    });

    return label.id;
  } catch (error) {
    logger.error("Failed to get or create system label", { type, error });
    return null;
  }
}

async function getSystemLabelId(options: {
  emailAccountId: string;
  type: SystemLabelType;
}): Promise<string | null> {
  const { emailAccountId, type } = options;

  const rule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: type,
    },
    include: {
      actions: {
        where: { type: ActionType.LABEL },
      },
    },
  });

  const labelAction = rule?.actions.find((a) => a.labelId);
  return labelAction?.labelId ?? null;
}

async function updateSystemLabelId(options: {
  emailAccountId: string;
  type: SystemLabelType;
  labelId: string;
}): Promise<void> {
  const { emailAccountId, type, labelId } = options;

  const rule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: type,
    },
    include: {
      actions: {
        where: { type: ActionType.LABEL },
      },
    },
  });

  if (!rule) {
    logger.warn("No rule found for system type, cannot update label", {
      emailAccountId,
      type,
      systemType: type,
    });
    return;
  }

  const labelAction = rule.actions.find((a) => a.type === ActionType.LABEL);

  const labelName = getRuleLabel(type);

  if (labelAction) {
    await prisma.action.update({
      where: { id: labelAction.id },
      data: {
        labelId,
        label: labelName,
      },
    });
  } else {
    await prisma.action.create({
      data: {
        type: ActionType.LABEL,
        labelId,
        label: labelName,
        ruleId: rule.id,
      },
    });
  }
}
