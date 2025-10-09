import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
  FYI_LABEL_NAME,
  ACTIONED_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { inboxZeroLabels } from "@/utils/label";
import { ActionType } from "@prisma/client";

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

  const labelNames = {
    TO_REPLY: NEEDS_REPLY_LABEL_NAME,
    AWAITING_REPLY: AWAITING_REPLY_LABEL_NAME,
    FYI: FYI_LABEL_NAME,
    ACTIONED: ACTIONED_LABEL_NAME,
    COLD_EMAIL: inboxZeroLabels.cold_email.name,
  };

  const labelName = labelNames[type];

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

  // Get the label name for this type
  const labelNames = {
    TO_REPLY: NEEDS_REPLY_LABEL_NAME,
    AWAITING_REPLY: AWAITING_REPLY_LABEL_NAME,
    FYI: FYI_LABEL_NAME,
    ACTIONED: ACTIONED_LABEL_NAME,
    COLD_EMAIL: inboxZeroLabels.cold_email.name,
  };
  const labelName = labelNames[type];

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
