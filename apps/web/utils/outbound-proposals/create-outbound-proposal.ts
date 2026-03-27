import { Prisma } from "@/generated/prisma/client";
import {
  OutboundProposalCloseReason,
  OutboundProposalStatus,
  type DraftMaterializationMode,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";

export async function createOutboundProposal({
  executedActionId,
  emailAccountId,
  threadId,
  messageId,
  materializationMode,
  draftId,
  to,
  cc,
  bcc,
  subject,
  originalContent,
  selectedAttachments,
}: {
  executedActionId: string;
  emailAccountId: string;
  threadId: string;
  messageId: string;
  materializationMode: DraftMaterializationMode;
  draftId: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  originalContent: string | null;
  selectedAttachments: SelectedAttachment[];
}) {
  const now = new Date();

  const proposal = await prisma.outboundProposal.upsert({
    where: { executedActionId },
    create: {
      executedActionId,
      emailAccountId,
      threadId,
      messageId,
      materializationMode,
      draftId,
      to,
      cc,
      bcc,
      subject,
      originalContent,
      currentContent: originalContent,
      selectedAttachments:
        selectedAttachments.length > 0
          ? (selectedAttachments as Prisma.InputJsonValue)
          : undefined,
    },
    update: {
      materializationMode,
      draftId,
      to,
      cc,
      bcc,
      subject,
      originalContent,
      ...(originalContent != null ? { currentContent: originalContent } : {}),
      selectedAttachments:
        selectedAttachments.length > 0
          ? (selectedAttachments as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      status: OutboundProposalStatus.OPEN,
      closeReason: null,
      resolvedAt: null,
    },
  });

  await prisma.outboundProposal.updateMany({
    where: {
      emailAccountId,
      threadId,
      status: {
        in: [OutboundProposalStatus.OPEN, OutboundProposalStatus.PROCESSING],
      },
      NOT: { id: proposal.id },
    },
    data: {
      status: OutboundProposalStatus.CLOSED,
      closeReason: OutboundProposalCloseReason.SUPERSEDED,
      resolvedAt: now,
    },
  });

  return proposal;
}
