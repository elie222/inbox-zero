import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { inboxZeroLabels } from "@/utils/label";
import { ActionType, SystemType } from "@prisma/client";

const logger = createScopedLogger("label-config");

type SystemLabelType = "needsReply" | "awaitingReply" | "coldEmail";

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
    needsReply: NEEDS_REPLY_LABEL_NAME,
    awaitingReply: AWAITING_REPLY_LABEL_NAME,
    coldEmail: inboxZeroLabels.cold_email.name,
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

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      needsReplyLabelId: true,
      awaitingReplyLabelId: true,
      coldEmailLabelId: true,
    },
  });

  if (!emailAccount) return null;

  switch (type) {
    case "needsReply":
      return emailAccount.needsReplyLabelId;
    case "awaitingReply":
      return emailAccount.awaitingReplyLabelId;
    case "coldEmail":
      return emailAccount.coldEmailLabelId;
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}

async function updateSystemLabelId(options: {
  emailAccountId: string;
  type: SystemLabelType;
  labelId: string;
}): Promise<void> {
  const { emailAccountId, type, labelId } = options;

  const fieldMap = {
    needsReply: "needsReplyLabelId",
    awaitingReply: "awaitingReplyLabelId",
    coldEmail: "coldEmailLabelId",
  } as const;

  const field = fieldMap[type];

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { [field]: labelId },
  });

  await updateAffectedRules({ emailAccountId, type, labelId });
}

async function updateAffectedRules(options: {
  emailAccountId: string;
  type: SystemLabelType;
  labelId: string;
}): Promise<void> {
  const { emailAccountId, type, labelId } = options;

  // Only update rules for needsReply type (TO_REPLY system type)
  if (type !== "needsReply") return;

  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      systemType: SystemType.TO_REPLY,
    },
    include: {
      actions: {
        where: { type: ActionType.LABEL },
      },
    },
  });

  for (const rule of rules) {
    for (const action of rule.actions) {
      await prisma.action.update({
        where: { id: action.id },
        data: { labelId },
      });
    }
  }
}
