import type { Condition } from "./schemas";
import type { ActionContext } from "@/utils/ai/agent/types";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

export type ConditionResult = {
  type: string;
  passed: boolean;
  reason?: string;
  value?: unknown;
};

export async function evaluateCondition({
  condition,
  context,
  logger,
  emailProvider,
  message,
}: {
  condition: Condition;
  context: ActionContext;
  logger: Logger;
  emailProvider: EmailProvider;
  message?: ParsedMessage | null;
}): Promise<ConditionResult> {
  switch (condition.type) {
    case "requiresFirstContact": {
      if (!message) {
        return {
          type: condition.type,
          passed: false,
          reason: "Email context is required to check first contact",
        };
      }

      const senderEmail = extractEmailAddress(message.headers.from);
      if (!senderEmail || !message.internalDate) {
        return {
          type: condition.type,
          passed: false,
          reason: "Missing sender or message date",
        };
      }

      const hasPrevious =
        await emailProvider.hasPreviousCommunicationsWithSenderOrDomain({
          from: senderEmail,
          date: new Date(message.internalDate),
          messageId: message.id,
        });

      return {
        type: condition.type,
        passed: !hasPrevious,
        reason: "Only applies to first-time senders",
        value: { isFirstContact: !hasPrevious },
      };
    }
    case "requiresThreadExists": {
      const hasThread = Boolean(context.threadId);
      return {
        type: condition.type,
        passed: hasThread,
        reason: "Must be part of a thread",
        value: { hasThread },
      };
    }
    case "requiresMinMessages": {
      if (!context.threadId) {
        return {
          type: condition.type,
          passed: false,
          reason: "Thread ID is required to count messages",
        };
      }

      const count = await getThreadMessageCount({
        emailProvider,
        threadId: context.threadId,
        logger,
      });

      return {
        type: condition.type,
        passed: count >= condition.minCount,
        reason: `Thread needs ${condition.minCount}+ messages (has ${count})`,
        value: { messageCount: count, required: condition.minCount },
      };
    }
    case "requiresOptIn": {
      const optedIn = await checkOptIn({
        emailAccountId: context.emailAccountId,
        feature: condition.feature,
      });

      return {
        type: condition.type,
        passed: optedIn,
        reason: `User must opt in to "${condition.feature}"`,
        value: { feature: condition.feature, optedIn },
      };
    }
    default: {
      logger.error("Unknown condition type encountered", { condition });
      return {
        type: "unknown",
        passed: false,
        reason: `Unknown condition type: "${(condition as any).type}"`,
      };
    }
  }
}

async function getThreadMessageCount({
  emailProvider,
  threadId,
  logger,
}: {
  emailProvider: EmailProvider;
  threadId: string;
  logger: Logger;
}): Promise<number> {
  try {
    const messages = await emailProvider.getThreadMessages(threadId);
    return messages.length;
  } catch (error) {
    logger.warn("Failed to fetch thread messages for count", { error });
    return 0;
  }
}

async function checkOptIn({
  emailAccountId,
  feature,
}: {
  emailAccountId: string;
  feature: string;
}): Promise<boolean> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      user: { select: { surveyFeatures: true } },
    },
  });

  const features = account?.user?.surveyFeatures ?? [];
  return features.includes(feature);
}
