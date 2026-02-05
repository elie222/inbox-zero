import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { createEmailProvider } from "@/utils/email/provider";
import { ensureEmailSendingEnabled } from "@/utils/mail";
import type { Logger } from "@/utils/logger";
import {
  validateAction,
  type ValidationResult,
} from "@/utils/ai/agent/validation/allowed-actions";
import type {
  ActionContext,
  ExecuteActionFn,
  ExecutionResult,
  StructuredAction,
  NormalizedStructuredAction,
} from "@/utils/ai/agent/types";
import { normalizeStructuredAction } from "@/utils/ai/agent/types";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { applySettingsUpdate } from "@/utils/ai/agent/settings";

const APPROVAL_REQUIRED_ACTIONS = ["send", "updateSettings"];

type ExecuteActionOptions = {
  action: StructuredAction;
  context: ActionContext;
  logger: Logger;
  emailAccountEmail: string;
};

type PerformActionResult = {
  artifacts?: Array<{
    artifactType: string;
    externalId?: string | null;
    name?: string | null;
    metadata?: unknown;
  }>;
  draftId?: string;
};

export function createExecuteAction({
  logger,
  emailAccountEmail,
}: {
  logger: Logger;
  emailAccountEmail: string;
}): ExecuteActionFn {
  return async (action, context) =>
    executeAction({
      action,
      context,
      logger,
      emailAccountEmail,
    });
}

export async function executeAction({
  action,
  context,
  logger,
  emailAccountEmail,
}: ExecuteActionOptions): Promise<ExecutionResult> {
  const normalizedAction = normalizeStructuredAction(action);
  const normalizedActionType = normalizedAction.type;

  const validation = await validateAction({ action, context, logger });

  if (context.dryRun) {
    return { success: validation.allowed, validation };
  }

  const requiresApproval =
    APPROVAL_REQUIRED_ACTIONS.includes(normalizedActionType);
  const initialStatus = !validation.allowed
    ? "BLOCKED"
    : requiresApproval
      ? "PENDING_APPROVAL"
      : "PENDING";

  const log = await prisma.executedAgentAction.create({
    data: {
      actionType: normalizedActionType,
      actionData: normalizedAction,
      resourceId:
        context.emailId ??
        ("resourceId" in action ? action.resourceId : null) ??
        null,
      threadId: context.threadId ?? null,
      messageSubject: context.messageSubject ?? null,
      status: initialStatus,
      error: validation.allowed ? null : validation.reason,
      triggeredBy: context.triggeredBy,
      patternId: context.patternId,
      skillId: context.skillId,
      matchMetadata: {
        conditionsChecked: validation.conditionsChecked,
      } as unknown as Prisma.InputJsonValue,
      emailAccountId: context.emailAccountId,
    },
  });

  if (!validation.allowed) {
    return {
      success: false,
      reason: validation.reason,
      logId: log.id,
      validation,
    };
  }

  if (requiresApproval) {
    return {
      success: true,
      requiresApproval: true,
      approvalId: log.id,
      logId: log.id,
      validation,
    };
  }

  return finalizeExecution({
    logId: log.id,
    action: normalizedAction,
    context,
    logger,
    emailAccountEmail,
    validation,
  });
}

export async function approveAgentAction({
  approvalId,
  userId,
  logger,
}: {
  approvalId: string;
  userId: string;
  logger: Logger;
}) {
  const approvedTrigger = `user:${userId}:approved`;
  const log = await prisma.executedAgentAction.findUnique({
    where: { id: approvalId },
    include: {
      emailAccount: {
        select: {
          id: true,
          email: true,
          userId: true,
          account: { select: { provider: true } },
        },
      },
    },
  });

  if (!log) return { error: "Action not found" };

  if (log.emailAccount?.userId !== userId) {
    return { error: "Unauthorized: you don't own this email account" };
  }

  if (log.status !== "PENDING_APPROVAL") {
    return { error: "Action is not pending approval" };
  }

  const claimed = await transitionPendingApproval({
    approvalId,
    nextStatus: "PENDING",
  });

  if (claimed.count === 0) {
    return { error: "Action is not pending approval" };
  }

  const action = log.actionData as NormalizedStructuredAction;
  const context: ActionContext = {
    emailAccountId: log.emailAccountId,
    provider: log.emailAccount.account.provider,
    resourceType: action.type === "updateSettings" ? "settings" : "email",
    emailId: log.resourceId ?? undefined,
    threadId: log.threadId ?? undefined,
    triggeredBy: approvedTrigger,
  };

  try {
    const result = await performAction({
      action,
      context,
      logger,
      emailAccountEmail: log.emailAccount.email,
    });

    await prisma.executedAgentAction.update({
      where: { id: approvalId },
      data: {
        status: "SUCCESS",
        triggeredBy: approvedTrigger,
      },
    });

    if (result.artifacts?.length) {
      await prisma.actionArtifact.createMany({
        data: result.artifacts.map((artifact) => ({
          artifactType: artifact.artifactType,
          externalId: artifact.externalId ?? null,
          name: artifact.name ?? null,
          metadata: artifact.metadata ?? undefined,
          executedAgentActionId: approvalId,
        })),
      });
    }

    return { success: true, logId: approvalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.executedAgentAction.update({
      where: { id: approvalId },
      data: {
        status: "FAILED",
        error: message,
        triggeredBy: approvedTrigger,
      },
    });

    return { error: message };
  }
}

export async function denyAgentAction({
  approvalId,
  userId,
}: {
  approvalId: string;
  userId: string;
}) {
  const deniedTrigger = `user:${userId}:denied`;
  const log = await prisma.executedAgentAction.findUnique({
    where: { id: approvalId },
    include: {
      emailAccount: { select: { userId: true } },
    },
  });

  if (!log) return { error: "Action not found" };

  if (log.emailAccount?.userId !== userId) {
    return { error: "Unauthorized: you don't own this email account" };
  }

  if (log.status !== "PENDING_APPROVAL") {
    return { error: "Action is not pending approval" };
  }

  const denied = await transitionPendingApproval({
    approvalId,
    nextStatus: "CANCELLED",
    triggeredBy: deniedTrigger,
  });

  if (denied.count === 0) {
    return { error: "Action is not pending approval" };
  }

  return { success: true };
}

async function finalizeExecution({
  logId,
  action,
  context,
  logger,
  emailAccountEmail,
  validation,
}: {
  logId: string;
  action: NormalizedStructuredAction;
  context: ActionContext;
  logger: Logger;
  emailAccountEmail: string;
  validation: ValidationResult;
}): Promise<ExecutionResult> {
  try {
    const result = await performAction({
      action,
      context,
      logger,
      emailAccountEmail,
    });

    await prisma.executedAgentAction.update({
      where: { id: logId },
      data: { status: "SUCCESS" },
    });

    if (result.artifacts?.length) {
      await prisma.actionArtifact.createMany({
        data: result.artifacts.map((artifact) => ({
          artifactType: artifact.artifactType,
          externalId: artifact.externalId ?? null,
          name: artifact.name ?? null,
          metadata: artifact.metadata ?? undefined,
          executedAgentActionId: logId,
        })),
      });
    }

    return {
      success: true,
      logId,
      validation,
      draftId: result.draftId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.executedAgentAction.update({
      where: { id: logId },
      data: { status: "FAILED", error: message },
    });

    return { success: false, error: message, logId, validation };
  }
}

async function performAction({
  action,
  context,
  logger,
  emailAccountEmail,
}: {
  action: NormalizedStructuredAction;
  context: ActionContext;
  logger: Logger;
  emailAccountEmail: string;
}): Promise<PerformActionResult> {
  const emailProvider = await createEmailProvider({
    emailAccountId: context.emailAccountId,
    provider: context.provider,
    logger,
  });

  // NormalizedStructuredAction uses Omit on a union which flattens it,
  // losing discriminated-union narrowing. Cast for property access.
  // biome-ignore lint/suspicious/noExplicitAny: flattened union type
  const a = action as any;

  switch (action.type) {
    case "archive": {
      const threadId = await resolveThreadId({
        emailProvider,
        context,
        fallbackMessageId: a.resourceId,
      });
      await emailProvider.archiveThread(threadId, emailAccountEmail);
      return {};
    }
    case "markRead": {
      const threadId = await resolveThreadId({
        emailProvider,
        context,
        fallbackMessageId: a.resourceId,
      });
      await emailProvider.markReadThread(threadId, a.read ?? true);
      return {};
    }
    case "classify": {
      const messageId = context.emailId ?? a.resourceId;
      const labelName = a.targetName ?? null;
      let labelId = a.targetExternalId ?? null;

      if (!labelId && labelName) {
        const label = await emailProvider.getLabelByName(labelName);
        labelId = label?.id ?? null;
      }

      if (!labelId && !labelName) {
        throw new Error("Target label not found");
      }

      if (!labelId && labelName) {
        throw new Error(`Target label "${labelName}" not found`);
      }

      await emailProvider.labelMessage({
        messageId,
        labelId: labelId ?? "",
        labelName,
      });

      const threadId = await resolveThreadId({
        emailProvider,
        context,
        fallbackMessageId: messageId,
      });

      await enforceTargetGroupCardinality({
        emailAccountId: context.emailAccountId,
        emailProvider,
        threadId,
        selected: {
          externalId: a.targetExternalId ?? null,
          name: a.targetName ?? null,
        },
        actionType: action.type,
        provider: context.provider,
        resourceType: context.resourceType,
      });

      return {};
    }
    case "move": {
      const threadId = await resolveThreadId({
        emailProvider,
        context,
        fallbackMessageId: a.resourceId,
      });

      let folderId = a.targetExternalId ?? null;
      if (!folderId && a.targetName) {
        folderId = await emailProvider.getOrCreateFolderIdByName(a.targetName);
      }

      if (!folderId) {
        throw new Error("Target folder not found");
      }

      await emailProvider.moveThreadToFolder(
        threadId,
        emailAccountEmail,
        folderId,
      );
      return {};
    }
    case "draft": {
      const messageId = context.emailId ?? a.resourceId;
      const message = await emailProvider.getMessage(messageId);
      const draftId = await createAssistantDraft({
        emailProvider,
        message,
        action: a,
        emailAccountId: context.emailAccountId,
        emailAccountEmail,
        logger,
      });

      return {
        draftId,
        artifacts: [
          {
            artifactType: "draft",
            externalId: draftId,
            metadata: { threadId: message.threadId },
          },
        ],
      };
    }
    case "send": {
      ensureEmailSendingEnabled();

      if (a.draftId) {
        await emailProvider.sendDraft(a.draftId);
        await prisma.assistantDraft.deleteMany({
          where: {
            emailAccountId: context.emailAccountId,
            draftId: a.draftId,
          },
        });
        return {};
      }

      if (!a.to || !a.subject || !a.content) {
        throw new Error("Missing recipient, subject, or content");
      }

      await emailProvider.sendEmail({
        to: a.to,
        cc: a.cc ?? undefined,
        bcc: a.bcc ?? undefined,
        subject: a.subject,
        messageText: a.content,
      });
      return {};
    }
    case "updateSettings": {
      await applySettingsUpdate({
        emailAccountId: context.emailAccountId,
        payload: a.settings,
      });
      return {};
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function resolveThreadId({
  emailProvider,
  context,
  fallbackMessageId,
}: {
  emailProvider: EmailProvider;
  context: ActionContext;
  fallbackMessageId: string;
}) {
  if (context.threadId) return context.threadId;
  const message = await emailProvider.getMessage(fallbackMessageId);
  return message.threadId;
}

async function createAssistantDraft({
  emailProvider,
  message,
  action,
  emailAccountId,
  emailAccountEmail,
  logger,
}: {
  emailProvider: EmailProvider;
  message: ParsedMessage;
  action: Extract<StructuredAction, { type: "draft" }>;
  emailAccountId: string;
  emailAccountEmail: string;
  logger: Logger;
}) {
  const existingDrafts = await prisma.assistantDraft.findMany({
    where: { emailAccountId, threadId: message.threadId },
  });

  for (const draft of existingDrafts) {
    try {
      await emailProvider.deleteDraft(draft.draftId);
    } catch (error) {
      logger.warn("Draft cleanup skipped", { draftId: draft.draftId, error });
    }
    await prisma.assistantDraft.delete({ where: { id: draft.id } });
  }

  const draft = await emailProvider.draftEmail(
    message,
    {
      to: action.to ?? undefined,
      subject: action.subject ?? undefined,
      content: action.content,
      cc: action.cc ?? undefined,
      bcc: action.bcc ?? undefined,
    },
    emailAccountEmail,
  );

  await prisma.assistantDraft.create({
    data: {
      draftId: draft.draftId,
      threadId: message.threadId,
      emailAccountId,
    },
  });

  return draft.draftId;
}

async function enforceTargetGroupCardinality({
  emailAccountId,
  emailProvider,
  threadId,
  selected,
  actionType,
  provider,
  resourceType,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  threadId: string;
  selected: { externalId: string | null; name: string | null };
  actionType: string;
  provider: string;
  resourceType: string;
}) {
  const target = await prisma.allowedActionOption.findFirst({
    where: {
      emailAccountId,
      actionType,
      provider,
      AND: [
        { OR: [{ resourceType }, { resourceType: null }] },
        {
          OR: [
            selected.externalId
              ? { externalId: selected.externalId }
              : undefined,
            selected.name ? { name: selected.name } : undefined,
          ].filter(Boolean) as unknown as Array<Record<string, string>>,
        },
      ],
    },
    include: { targetGroup: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!target?.targetGroup || target.targetGroup.cardinality !== "SINGLE") {
    return;
  }

  const groupOptions = await prisma.allowedActionOption.findMany({
    where: {
      emailAccountId,
      targetGroupId: target.targetGroupId,
    },
  });

  const removeCandidates = groupOptions.filter((option) => {
    const key = option.externalId ?? option.name;
    const selectedKey = selected.externalId ?? selected.name;
    return key && key !== selectedKey;
  });

  const removeLabelIds = await resolveLabelIds({
    emailProvider,
    options: removeCandidates,
  });

  if (removeLabelIds.length) {
    await emailProvider.removeThreadLabels(threadId, removeLabelIds);
  }
}

async function resolveLabelIds({
  emailProvider,
  options,
}: {
  emailProvider: EmailProvider;
  options: Array<{ externalId: string | null; name: string }>;
}) {
  const labelIds: string[] = [];

  for (const option of options) {
    if (option.externalId) {
      labelIds.push(option.externalId);
      continue;
    }

    const label = await emailProvider.getLabelByName(option.name);
    if (label?.id) labelIds.push(label.id);
  }

  return labelIds;
}

async function transitionPendingApproval({
  approvalId,
  nextStatus,
  triggeredBy,
}: {
  approvalId: string;
  nextStatus: "PENDING" | "CANCELLED";
  triggeredBy?: string;
}) {
  return prisma.executedAgentAction.updateMany({
    where: {
      id: approvalId,
      status: "PENDING_APPROVAL",
    },
    data: {
      status: nextStatus,
      ...(triggeredBy ? { triggeredBy } : {}),
    },
  });
}
