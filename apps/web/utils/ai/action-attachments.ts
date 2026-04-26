import { AttachmentSourceType } from "@/generated/prisma/enums";
import {
  type SelectedAttachment,
  attachmentSourceInputSchema,
} from "@/utils/attachments/source-schema";
import { resolveDraftAttachments } from "@/utils/attachments/draft-attachments";
import prisma from "@/utils/prisma";
import type {
  ActionExecutionEmailAccount,
  ActionItem,
  EmailForAction,
  ExecutedRuleForAction,
} from "@/utils/ai/types";
import type { Logger } from "@/utils/logger";
import { getReplyWithConfidence } from "@/utils/redis/reply";

export async function resolveActionAttachments({
  email,
  emailAccount,
  executedRule,
  logger,
  staticAttachments,
  includeAiSelectedAttachments,
}: {
  email: EmailForAction;
  emailAccount: ActionExecutionEmailAccount;
  executedRule: ExecutedRuleForAction;
  logger: Logger;
  staticAttachments?: ActionItem["staticAttachments"];
  includeAiSelectedAttachments: boolean;
}) {
  const staticSelectedAttachments = parseStaticAttachments(staticAttachments);

  if (
    staticSelectedAttachments.length === 0 &&
    (!includeAiSelectedAttachments || !executedRule.ruleId)
  ) {
    return [];
  }

  const [aiSelectedAttachments, staticSelected] = await Promise.all([
    includeAiSelectedAttachments
      ? getDraftSelectedAttachments({
          email,
          emailAccountId: emailAccount.id,
          executedRule,
          logger,
        })
      : Promise.resolve([]),
    Promise.resolve(staticSelectedAttachments),
  ]);

  const allSelected = [
    ...new Map(
      [...aiSelectedAttachments, ...staticSelected].map((attachment) => [
        `${attachment.driveConnectionId}:${attachment.fileId}`,
        attachment,
      ]),
    ).values(),
  ];

  if (allSelected.length === 0) return [];

  const attachments = await resolveDraftAttachments({
    emailAccountId: emailAccount.id,
    userId: emailAccount.userId,
    selectedAttachments: allSelected,
    logger,
  });

  if (attachments.length === 0) {
    logger.warn("Selected rule attachments could not be resolved", {
      messageId: email.id,
      ruleId: executedRule.ruleId,
      selectedAttachmentCount: allSelected.length,
    });
  }

  return attachments;
}

async function getDraftSelectedAttachments({
  email,
  emailAccountId,
  executedRule,
  logger,
}: {
  email: EmailForAction;
  emailAccountId: string;
  executedRule: ExecutedRuleForAction;
  logger: Logger;
}): Promise<SelectedAttachment[]> {
  if (!executedRule.ruleId) return [];

  const attachmentSource = await prisma.attachmentSource.findFirst({
    where: { ruleId: executedRule.ruleId },
    select: { id: true },
  });

  if (!attachmentSource) return [];

  const cachedDraft = await getReplyWithConfidence({
    emailAccountId,
    messageId: email.id,
    ruleId: executedRule.ruleId,
  });

  if (cachedDraft) {
    return cachedDraft.attachments ?? [];
  }

  logger.warn("Draft attachment cache missing, skipping attachments", {
    messageId: email.id,
    ruleId: executedRule.ruleId,
  });
  return [];
}

function parseStaticAttachments(raw: unknown): SelectedAttachment[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  const parsed = attachmentSourceInputSchema.array().safeParse(raw);

  if (!parsed.success) return [];

  return parsed.data
    .filter((item) => item.type === AttachmentSourceType.FILE)
    .map((item) => ({
      driveConnectionId: item.driveConnectionId,
      fileId: item.sourceId,
      filename: item.name,
      mimeType: "application/pdf",
    }));
}
