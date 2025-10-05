import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME_LEGACY,
  AWAITING_REPLY_LABEL_NAME_LEGACY,
} from "@/utils/reply-tracker/consts";
import { inboxZeroLabels } from "@/utils/label";

const logger = createScopedLogger("label-config");

type SystemLabelType = "needsReply" | "awaitingReply" | "coldEmail" | "done";

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

  // Define new numbered names and legacy names for backward compatibility
  const labelNames = {
    needsReply: {
      name: NEEDS_REPLY_LABEL_NAME,
      legacy: NEEDS_REPLY_LABEL_NAME_LEGACY,
    },
    awaitingReply: {
      name: AWAITING_REPLY_LABEL_NAME,
      legacy: AWAITING_REPLY_LABEL_NAME_LEGACY,
    },
    coldEmail: {
      name: inboxZeroLabels.cold_email.name,
      legacy: inboxZeroLabels.cold_email.nameLegacy,
    },
    done: {
      name: "9. Done",
      legacy: "Done",
    },
  };

  const { name: newName, legacy: legacyName } = labelNames[type];

  try {
    // 1. Check if new numbered version exists
    let label = await provider.getLabelByName(newName);
    if (label) {
      logger.info("Found new numbered label", { type, name: newName });
      await updateSystemLabelId({
        emailAccountId,
        type,
        labelId: label.id,
      });
      return label.id;
    }

    // 2. Check if legacy version exists (for existing users)
    label = await provider.getLabelByName(legacyName);
    if (label) {
      logger.info("Found legacy label, using it for existing user", {
        type,
        name: legacyName,
      });
      await updateSystemLabelId({
        emailAccountId,
        type,
        labelId: label.id,
      });
      return label.id;
    }

    // 3. Create new numbered version (new users only)
    logger.info("Creating new numbered label for new user", {
      type,
      name: newName,
    });
    label = await provider.createLabel(newName);

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

export async function getSystemLabelId(options: {
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
      doneLabelId: true,
    },
  });

  if (!emailAccount) return null;

  const fieldMap = {
    needsReply: emailAccount.needsReplyLabelId,
    awaitingReply: emailAccount.awaitingReplyLabelId,
    coldEmail: emailAccount.coldEmailLabelId,
    done: emailAccount.doneLabelId,
  } as const;

  return fieldMap[type] ?? null;
}

export async function updateSystemLabelId(options: {
  emailAccountId: string;
  type: SystemLabelType;
  labelId: string;
}): Promise<void> {
  const { emailAccountId, type, labelId } = options;

  const fieldMap = {
    needsReply: "needsReplyLabelId",
    awaitingReply: "awaitingReplyLabelId",
    coldEmail: "coldEmailLabelId",
    done: "doneLabelId",
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
      systemType: "TO_REPLY",
    },
    include: {
      actions: {
        where: { type: "LABEL" },
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

export async function getLabelDisplayName(options: {
  labelId: string;
  provider: EmailProvider;
}): Promise<string | null> {
  const { labelId, provider } = options;

  try {
    const label = await provider.getLabelById(labelId);
    return label?.name ?? null;
  } catch (error) {
    logger.error("Failed to get label display name", { labelId, error });
    return null;
  }
}
