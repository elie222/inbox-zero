import {
  ActionType,
  type ClassificationFeedbackEventType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { truncate } from "@/utils/string";

const MAX_FEEDBACK_FOR_PROMPT = 10;

export type ClassificationFeedbackItem = {
  subject: string | null;
  ruleName: string;
  eventType: "LABEL_ADDED" | "LABEL_REMOVED";
};

export async function saveClassificationFeedback({
  emailAccountId,
  sender,
  ruleId,
  threadId,
  messageId,
  eventType,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  ruleId: string;
  threadId: string;
  messageId: string;
  eventType: ClassificationFeedbackEventType;
  logger: Logger;
}) {
  const normalizedSender = sender.toLowerCase();

  logger.trace("Saving classification feedback", {
    sender: normalizedSender,
    ruleId,
    eventType,
  });

  await prisma.classificationFeedback.upsert({
    where: {
      emailAccountId_sender_ruleId_messageId_eventType: {
        emailAccountId,
        sender: normalizedSender,
        ruleId,
        messageId,
        eventType,
      },
    },
    create: {
      emailAccountId,
      sender: normalizedSender,
      ruleId,
      threadId,
      messageId,
      eventType,
    },
    update: {},
  });
}

export async function getClassificationFeedback({
  emailAccountId,
  senderEmail,
  provider,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<ClassificationFeedbackItem[] | null> {
  const feedback = await prisma.classificationFeedback.findMany({
    where: {
      emailAccountId,
      sender: senderEmail.toLowerCase(),
      rule: { enabled: true },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_FEEDBACK_FOR_PROMPT,
    select: {
      messageId: true,
      eventType: true,
      rule: { select: { name: true } },
    },
  });

  if (!feedback?.length) return null;

  const subjects = await fetchSubjectsForFeedback(
    feedback.map((f) => f.messageId),
    provider,
    logger,
  );

  return feedback.map((entry) => ({
    subject: subjects.get(entry.messageId) ?? null,
    ruleName: entry.rule?.name ?? "Unknown",
    eventType: entry.eventType,
  }));
}

export async function findRuleByLabelId({
  labelId,
  emailAccountId,
}: {
  labelId: string;
  emailAccountId: string;
}) {
  return prisma.rule.findFirst({
    where: {
      emailAccountId,
      enabled: true,
      actions: {
        some: {
          labelId,
          type: ActionType.LABEL,
        },
      },
    },
    select: { id: true, systemType: true },
  });
}

async function fetchSubjectsForFeedback(
  messageIds: string[],
  provider: EmailProvider,
  logger: Logger,
): Promise<Map<string, string>> {
  const subjectMap = new Map<string, string>();

  try {
    const messages = await provider.getMessagesBatch(messageIds);

    for (const message of messages) {
      if (message.id && message.headers.subject) {
        subjectMap.set(message.id, truncate(message.headers.subject, 80));
      }
    }
  } catch (error) {
    logger.warn("Failed to fetch subjects for classification feedback", {
      error,
    });
  }

  return subjectMap;
}
