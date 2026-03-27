import type Mail from "nodemailer/lib/mailer";
import {
  DraftMaterializationMode,
  OutboundProposalCloseReason,
  OutboundProposalStatus,
} from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiRewriteOutboundProposal } from "@/utils/outbound-proposals/rewrite-outbound-proposal";
import { resolveDraftAttachments } from "@/utils/attachments/draft-attachments";
import {
  attachmentSourceInputSchema,
  selectedAttachmentSchema,
} from "@/utils/attachments/source-schema";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import { formatReplySubject } from "@/utils/email/subject";
import { calculateSimilarity } from "@/utils/similarity-score";
import {
  isMeaningfulDraftEdit,
  saveDraftSendLogReplyMemory,
} from "@/utils/ai/reply/reply-memory";

export const OUTBOUND_PROPOSAL_SEND_ACTION_ID = "draft-review-send";
export const OUTBOUND_PROPOSAL_DISMISS_ACTION_ID = "draft-review-dismiss";

const selectedAttachmentsSchema = selectedAttachmentSchema.array();

const staticAttachmentsSchema = attachmentSourceInputSchema.array();

export async function findOpenOutboundProposalByChatId(chatId: string) {
  return prisma.outboundProposal.findFirst({
    where: {
      chatId,
      status: OutboundProposalStatus.OPEN,
    },
    include: {
      messagingChannel: true,
      emailAccount: {
        select: {
          id: true,
          email: true,
          userId: true,
          account: { select: { provider: true } },
        },
      },
      executedAction: {
        select: {
          id: true,
          content: true,
          staticAttachments: true,
        },
      },
    },
  });
}

export async function rewriteOutboundProposal({
  proposalId,
  instructions,
  logger,
}: {
  proposalId: string;
  instructions: string;
  logger: Logger;
}) {
  const proposal = await findProposalForReview(proposalId);
  if (!proposal) return { status: "missing" as const };
  if (proposal.status !== OutboundProposalStatus.OPEN) {
    return { status: "resolved" as const, proposal };
  }

  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: proposal.emailAccountId,
  });
  if (!emailAccount) return { status: "missing" as const };

  const emailProvider = await createEmailProvider({
    emailAccountId: proposal.emailAccountId,
    provider: proposal.emailAccount.account.provider,
    logger,
  });
  const originalMessage = await emailProvider.getMessage(proposal.messageId);

  if (
    proposal.materializationMode === DraftMaterializationMode.MAILBOX_DRAFT &&
    proposal.draftId
  ) {
    const draft = await emailProvider.getDraft(proposal.draftId);
    if (!draft) {
      await closeOutboundProposal({
        proposalId: proposal.id,
        closeReason: OutboundProposalCloseReason.DRAFT_MISSING,
      });
      return { status: "draft-missing" as const };
    }
  }

  const currentContent =
    proposal.currentContent ||
    proposal.originalContent ||
    proposal.executedAction.content;
  if (!currentContent) {
    return { status: "missing" as const };
  }

  const revisedContent = await aiRewriteOutboundProposal({
    emailAccount,
    originalMessage,
    currentContent,
    instructions,
  });

  const updatedProposal = await prisma.outboundProposal.update({
    where: { id: proposal.id },
    data: {
      currentContent: revisedContent,
      revision: { increment: 1 },
    },
  });

  if (
    updatedProposal.materializationMode ===
      DraftMaterializationMode.MAILBOX_DRAFT &&
    updatedProposal.draftId
  ) {
    await emailProvider.updateDraft(updatedProposal.draftId, {
      messageHtml: revisedContent,
      ...(updatedProposal.subject ? { subject: updatedProposal.subject } : {}),
    });
  }

  return {
    status: "updated" as const,
    proposal: updatedProposal,
  };
}

export async function sendOutboundProposal({
  proposalId,
  logger,
}: {
  proposalId: string;
  logger: Logger;
}) {
  const proposal = await findProposalForReview(proposalId);
  if (!proposal) return { status: "missing" as const };

  const reserved = await prisma.outboundProposal.updateMany({
    where: {
      id: proposal.id,
      status: OutboundProposalStatus.OPEN,
    },
    data: {
      status: OutboundProposalStatus.PROCESSING,
    },
  });

  if (reserved.count === 0) {
    return { status: "resolved" as const };
  }

  try {
    const emailProvider = await createEmailProvider({
      emailAccountId: proposal.emailAccountId,
      provider: proposal.emailAccount.account.provider,
      logger,
    });

    let sendResult: { messageId: string; threadId: string };

    if (
      proposal.materializationMode === DraftMaterializationMode.MAILBOX_DRAFT
    ) {
      if (!proposal.draftId) {
        await closeOutboundProposal({
          proposalId: proposal.id,
          closeReason: OutboundProposalCloseReason.DRAFT_MISSING,
        });
        return { status: "draft-missing" as const };
      }

      const draft = await emailProvider.getDraft(proposal.draftId);
      if (!draft) {
        await closeOutboundProposal({
          proposalId: proposal.id,
          closeReason: OutboundProposalCloseReason.DRAFT_MISSING,
        });
        return { status: "draft-missing" as const };
      }

      sendResult = await emailProvider.sendDraft(proposal.draftId);
    } else {
      const originalMessage = await emailProvider.getMessage(
        proposal.messageId,
      );
      const attachments = await resolveOutboundProposalAttachments({
        emailAccountId: proposal.emailAccountId,
        userId: proposal.emailAccount.userId,
        selectedAttachments: proposal.selectedAttachments,
        staticAttachments: proposal.executedAction.staticAttachments,
        logger,
      });

      sendResult = await emailProvider.sendEmailWithHtml({
        replyToEmail: {
          threadId: originalMessage.threadId,
          headerMessageId: originalMessage.headers["message-id"] || "",
          references: originalMessage.headers.references,
          messageId: originalMessage.id,
        },
        to:
          proposal.to ||
          originalMessage.headers["reply-to"] ||
          originalMessage.headers.from,
        ...(proposal.cc ? { cc: proposal.cc } : {}),
        ...(proposal.bcc ? { bcc: proposal.bcc } : {}),
        subject:
          proposal.subject ||
          formatReplySubject(originalMessage.headers.subject),
        messageHtml:
          proposal.currentContent ||
          proposal.originalContent ||
          proposal.executedAction.content ||
          "",
        ...(attachments.length
          ? { attachments: toProviderHtmlAttachments(attachments) }
          : {}),
      });

      await recordMessagingOnlySendLog({
        executedActionId: proposal.executedAction.id,
        originalContent: proposal.executedAction.content,
        sentContent:
          proposal.currentContent ||
          proposal.originalContent ||
          proposal.executedAction.content ||
          "",
        sentMessageId:
          sendResult.messageId ||
          sendResult.threadId ||
          `proposal-${proposal.id}`,
      });
    }

    const updatedProposal = await prisma.outboundProposal.update({
      where: { id: proposal.id },
      data: {
        status: OutboundProposalStatus.SENT,
        resolvedAt: new Date(),
        sentMessageId: sendResult.messageId || null,
        sentThreadId: sendResult.threadId || null,
      },
    });

    return {
      status: "sent" as const,
      proposal: updatedProposal,
      sendResult,
    };
  } catch (error) {
    await prisma.outboundProposal.update({
      where: { id: proposal.id },
      data: { status: OutboundProposalStatus.OPEN },
    });
    throw error;
  }
}

export async function dismissOutboundProposal({
  proposalId,
  logger,
}: {
  proposalId: string;
  logger: Logger;
}) {
  const proposal = await findProposalForReview(proposalId);
  if (!proposal) return { status: "missing" as const };

  const reserved = await prisma.outboundProposal.updateMany({
    where: {
      id: proposal.id,
      status: OutboundProposalStatus.OPEN,
    },
    data: {
      status: OutboundProposalStatus.PROCESSING,
    },
  });

  if (reserved.count === 0) {
    return { status: "resolved" as const };
  }

  try {
    if (
      proposal.materializationMode === DraftMaterializationMode.MAILBOX_DRAFT &&
      proposal.draftId
    ) {
      const emailProvider = await createEmailProvider({
        emailAccountId: proposal.emailAccountId,
        provider: proposal.emailAccount.account.provider,
        logger,
      });
      const draft = await emailProvider.getDraft(proposal.draftId);
      if (!draft) {
        await closeOutboundProposal({
          proposalId: proposal.id,
          closeReason: OutboundProposalCloseReason.DRAFT_MISSING,
        });
        return { status: "draft-missing" as const };
      }

      await emailProvider.deleteDraft(proposal.draftId);
    }

    const updatedProposal = await prisma.outboundProposal.update({
      where: { id: proposal.id },
      data: {
        status: OutboundProposalStatus.DISMISSED,
        resolvedAt: new Date(),
      },
    });

    await prisma.executedAction.update({
      where: { id: proposal.executedAction.id },
      data: {
        wasDraftSent: false,
      },
    });

    return {
      status: "dismissed" as const,
      proposal: updatedProposal,
    };
  } catch (error) {
    await prisma.outboundProposal.update({
      where: { id: proposal.id },
      data: { status: OutboundProposalStatus.OPEN },
    });
    throw error;
  }
}

export async function markOutboundProposalSentExternally({
  draftId,
}: {
  draftId: string;
}) {
  await prisma.outboundProposal.updateMany({
    where: {
      draftId,
      status: {
        in: [OutboundProposalStatus.OPEN, OutboundProposalStatus.PROCESSING],
      },
    },
    data: {
      status: OutboundProposalStatus.CLOSED,
      closeReason: OutboundProposalCloseReason.SENT_EXTERNALLY,
      resolvedAt: new Date(),
    },
  });
}

async function findProposalForReview(proposalId: string) {
  return prisma.outboundProposal.findUnique({
    where: { id: proposalId },
    include: {
      messagingChannel: true,
      emailAccount: {
        select: {
          id: true,
          email: true,
          userId: true,
          account: { select: { provider: true } },
        },
      },
      executedAction: {
        select: {
          id: true,
          content: true,
          staticAttachments: true,
        },
      },
    },
  });
}

async function closeOutboundProposal({
  proposalId,
  closeReason,
}: {
  proposalId: string;
  closeReason: OutboundProposalCloseReason;
}) {
  await prisma.outboundProposal.update({
    where: { id: proposalId },
    data: {
      status: OutboundProposalStatus.CLOSED,
      closeReason,
      resolvedAt: new Date(),
    },
  });
}

async function resolveOutboundProposalAttachments({
  emailAccountId,
  userId,
  selectedAttachments,
  staticAttachments,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  selectedAttachments: unknown;
  staticAttachments: unknown;
  logger: Logger;
}) {
  const parsedSelected =
    selectedAttachmentsSchema.safeParse(selectedAttachments);
  const parsedStatic = staticAttachmentsSchema.safeParse(staticAttachments);

  const attachments = [
    ...(parsedSelected.success ? parsedSelected.data : []),
    ...(parsedStatic.success ? parsedStatic.data : [])
      .filter((attachment) => attachment.type === AttachmentSourceType.FILE)
      .map((attachment) => ({
        driveConnectionId: attachment.driveConnectionId,
        fileId: attachment.sourceId,
        filename: attachment.name,
        mimeType: "application/pdf",
      })),
  ];

  const dedupedAttachments = [
    ...new Map(
      attachments.map((attachment) => [
        `${attachment.driveConnectionId}:${attachment.fileId}`,
        attachment,
      ]),
    ).values(),
  ];

  if (dedupedAttachments.length === 0) return [];

  return resolveDraftAttachments({
    emailAccountId,
    userId,
    selectedAttachments: dedupedAttachments,
    logger,
  });
}

async function recordMessagingOnlySendLog({
  executedActionId,
  originalContent,
  sentContent,
  sentMessageId,
}: {
  executedActionId: string;
  originalContent: string | null;
  sentContent: string;
  sentMessageId: string;
}) {
  const similarityScore = calculateSimilarity(originalContent, sentContent);

  const draftSendLog = await prisma.draftSendLog.upsert({
    where: { executedActionId },
    update: {
      sentMessageId,
      similarityScore,
    },
    create: {
      executedActionId,
      sentMessageId,
      similarityScore,
    },
  });

  await prisma.executedAction.update({
    where: { id: executedActionId },
    data: {
      wasDraftSent: true,
    },
  });

  if (
    originalContent &&
    isMeaningfulDraftEdit({
      draftText: originalContent,
      sentText: sentContent,
      similarityScore,
    })
  ) {
    await saveDraftSendLogReplyMemory({
      draftSendLogId: draftSendLog.id,
      sentText: sentContent,
    });
  }
}

function toProviderHtmlAttachments(attachments: Mail.Attachment[]) {
  return attachments
    .map((attachment) => {
      if (!attachment.filename || !attachment.contentType) return null;

      const content =
        typeof attachment.content === "string"
          ? attachment.content
          : Buffer.isBuffer(attachment.content)
            ? attachment.content.toString("base64")
            : null;

      if (!content) return null;

      return {
        filename: attachment.filename,
        content,
        contentType: attachment.contentType,
      };
    })
    .filter((attachment): attachment is NonNullable<typeof attachment> =>
      Boolean(attachment),
    );
}
