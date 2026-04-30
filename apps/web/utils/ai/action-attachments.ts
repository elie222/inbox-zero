import { AttachmentSourceType } from "@/generated/prisma/enums";
import {
  type SelectedAttachment,
  attachmentSourceInputSchema,
  selectedAttachmentSchema,
} from "@/utils/attachments/source-schema";
import { resolveDraftAttachments } from "@/utils/attachments/draft-attachments";
import type {
  ActionExecutionEmailAccount,
  ActionItem,
  EmailForAction,
  ExecutedRuleForAction,
} from "@/utils/ai/types";
import type { Logger } from "@/utils/logger";

export async function resolveActionAttachments({
  email,
  emailAccount,
  executedRule,
  logger,
  staticAttachments,
  selectedAttachments,
  includeAiSelectedAttachments,
}: {
  email: EmailForAction;
  emailAccount: ActionExecutionEmailAccount;
  executedRule: ExecutedRuleForAction;
  logger: Logger;
  staticAttachments?: ActionItem["staticAttachments"];
  selectedAttachments?: ActionItem["selectedAttachments"];
  includeAiSelectedAttachments: boolean;
}) {
  const staticSelectedAttachments = parseStaticAttachments(staticAttachments);
  const aiSelectedAttachments = includeAiSelectedAttachments
    ? parseSelectedAttachments(selectedAttachments)
    : [];

  if (
    staticSelectedAttachments.length === 0 &&
    aiSelectedAttachments.length === 0
  ) {
    return [];
  }

  const allSelected = [
    ...new Map(
      [...aiSelectedAttachments, ...staticSelectedAttachments].map(
        (attachment) => [
          `${attachment.driveConnectionId}:${attachment.fileId}`,
          attachment,
        ],
      ),
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

function parseSelectedAttachments(raw: unknown): SelectedAttachment[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  const parsed = selectedAttachmentSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}
