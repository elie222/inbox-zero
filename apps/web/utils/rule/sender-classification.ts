import {
  ActionType,
  SenderClassificationEventType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { truncate } from "@/utils/string";

const MAX_CLASSIFICATIONS_FOR_PROMPT = 10;

export async function saveSenderClassification({
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
  eventType: SenderClassificationEventType;
  logger: Logger;
}) {
  const normalizedSender = sender.toLowerCase();

  logger.trace("Saving sender classification", {
    sender: normalizedSender,
    ruleId,
    eventType,
  });

  await prisma.senderClassification.upsert({
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

export async function getSenderClassificationsForPrompt({
  emailAccountId,
  senderEmail,
  provider,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<string | null> {
  const classifications = await prisma.senderClassification.findMany({
    where: {
      emailAccountId,
      sender: senderEmail.toLowerCase(),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_CLASSIFICATIONS_FOR_PROMPT,
    select: {
      messageId: true,
      eventType: true,
      rule: { select: { name: true } },
    },
  });

  if (classifications.length === 0) return null;

  const subjects = await fetchSubjectsForClassifications(
    classifications.map((c) => c.messageId),
    provider,
    logger,
  );

  return formatClassificationsPrompt(classifications, subjects);
}

async function fetchSubjectsForClassifications(
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
    logger.warn("Failed to fetch subjects for sender classifications", {
      error,
    });
  }

  return subjectMap;
}

function formatClassificationsPrompt(
  classifications: {
    messageId: string;
    eventType: SenderClassificationEventType;
    rule: { name: string } | null;
  }[],
  subjects: Map<string, string>,
): string {
  const lines: string[] = [];

  for (const classification of classifications) {
    const ruleName = classification.rule?.name ?? "Unknown";
    const subject = subjects.get(classification.messageId);

    if (
      classification.eventType === SenderClassificationEventType.LABEL_ADDED
    ) {
      if (subject) {
        lines.push(`- "${subject}" → ${ruleName}`);
      } else {
        lines.push(`- (email no longer available) → ${ruleName}`);
      }
    } else {
      if (subject) {
        lines.push(`- "${subject}" removed from ${ruleName}`);
      } else {
        lines.push(`- Removed from ${ruleName}`);
      }
    }
  }

  return `<sender_classifications>
User has manually classified emails from this sender into these rules:
${lines.join("\n")}
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`;
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
